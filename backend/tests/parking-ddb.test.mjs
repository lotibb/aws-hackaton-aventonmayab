// Integration against DynamoDB Local, not an in-memory fake of its transactions.
// Requires DYNAMODB_ENDPOINT=http://localhost:8000 (see backend/README.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../src/package.json', import.meta.url));
const { DynamoDBClient, CreateTableCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const endpoint = process.env.DYNAMODB_ENDPOINT;

test('DynamoDB transactions: capacity, parallel requests, session privacy, exit and legacy compatibility', { skip: !endpoint }, async () => {
  assert.match(endpoint, /^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/, 'This suite only creates temporary tables on a local endpoint');
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'local';
  process.env.AWS_SECRET_ACCESS_KEY = 'local';
  const prefix = `parking-test-${randomUUID()}`;
  const client = new DynamoDBClient({ endpoint, region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
  const document = DynamoDBDocumentClient.from(client);
  const created = [];
  try {
    const { tables, db } = await import('../src/lib/db.mjs');
    for (const [field, key] of [['users', 'userId'], ['parkingZones', 'zoneId'], ['parkingSessions', 'userId']]) {
      tables[field] = `${prefix}-${field}`;
      await client.send(new CreateTableCommand({
        TableName: tables[field], BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [{ AttributeName: key, AttributeType: 'S' }],
        KeySchema: [{ AttributeName: key, KeyType: 'HASH' }],
      }));
      created.push(tables[field]);
    }
    const { handler } = await import('../src/parking.mjs');
    const call = async (routeKey, userId, body) => {
      const result = await handler({ routeKey, body: body && JSON.stringify(body), requestContext: { authorizer: { jwt: { claims: { sub: userId } } } } });
      return { status: result.statusCode, data: JSON.parse(result.body) };
    };
    const get = async (TableName, Key) => (await document.send(new GetCommand({ TableName, Key, ConsistentRead: true }))).Item;
    for (const userId of ['a', 'b', 'c']) await document.send(new PutCommand({ TableName: tables.users, Item: { userId } }));
    await document.send(new PutCommand({ TableName: tables.parkingZones, Item: { zoneId: 'P9', name: 'Test', capacity: 1, registeredOccupied: 0 } }));
    const entries = await Promise.all(Array.from({ length: 8 }, () => call('POST /parking/entry', 'a', { zoneId: 'P9' })));
    assert.equal(entries.filter((r) => r.status === 200).length, 1);
    assert.ok(entries.every((r) => [200, 409].includes(r.status)));
    assert.equal((await get(tables.parkingZones, { zoneId: 'P9' })).registeredOccupied, 1);
    assert.equal((await call('GET /parking/session', 'b')).data.session, null);
    assert.equal((await call('POST /parking/entry', 'b', { zoneId: 'P9' })).status, 409);
    const exits = await Promise.all(Array.from({ length: 6 }, () => call('POST /parking/exit', 'a')));
    assert.equal(exits.filter((r) => r.status === 200).length, 1);
    assert.equal((await get(tables.parkingZones, { zoneId: 'P9' })).registeredOccupied, 0);
    const lastSpot = await Promise.all(['b', 'c'].map((id) => call('POST /parking/entry', id, { zoneId: 'P9' })));
    assert.equal(lastSpot.filter((r) => r.status === 200).length, 1);
    assert.equal((await get(tables.parkingZones, { zoneId: 'P9' })).registeredOccupied, 1);
    const winner = lastSpot[0].status === 200 ? 'b' : 'c';
    const { leaveParking } = await import('../src/lib/parking-store.mjs');
    // DELETE /me marks the profile first, then uses this same release operation.
    await document.send(new PutCommand({ TableName: tables.users, Item: { userId: winner, deletingAt: new Date().toISOString() } }));
    await leaveParking(winner, { allowMissing: true });
    assert.equal((await get(tables.parkingZones, { zoneId: 'P9' })).registeredOccupied, 0);
    assert.equal((await call('POST /parking/entry', winner, { zoneId: 'P9' })).status, 409);
    await document.send(new PutCommand({ TableName: tables.parkingSessions, Item: { userId: 'a', zoneId: 'P9', enteredAt: '2026-01-01T00:00:00Z' } }));
    assert.equal((await call('POST /parking/exit', 'a')).status, 200);
    assert.equal((await get(tables.parkingZones, { zoneId: 'P9' })).registeredOccupied, 0);

    // A delayed exit must never delete a replacement session or decrement twice.
    assert.equal((await call('POST /parking/entry', 'a', { zoneId: 'P9' })).status, 200);
    const originalSend = db.send.bind(db);
    let release;
    let captured;
    const ready = new Promise((resolve) => { captured = resolve; });
    const resume = new Promise((resolve) => { release = resolve; });
    let pauseOnce = true;
    db.send = async (command) => {
      const result = await originalSend(command);
      if (pauseOnce && command.constructor.name === 'GetCommand' && command.input.TableName === tables.parkingSessions) {
        pauseOnce = false;
        captured();
        await resume;
      }
      return result;
    };
    try {
      const delayedExit = call('POST /parking/exit', 'a');
      await ready;
      assert.equal((await call('POST /parking/exit', 'a')).status, 200);
      assert.equal((await call('POST /parking/entry', 'a', { zoneId: 'P9' })).status, 200);
      const replacement = await get(tables.parkingSessions, { userId: 'a' });
      release();
      assert.equal((await delayedExit).status, 409);
      assert.equal((await get(tables.parkingSessions, { userId: 'a' })).sessionId, replacement.sessionId);
      assert.equal((await get(tables.parkingZones, { zoneId: 'P9' })).registeredOccupied, 1);
    } finally { release(); db.send = originalSend; }
    assert.equal((await call('POST /parking/exit', 'a')).status, 200);

    const { syncParkingZones } = await import('../src/scripts/sync-parking-zones.mjs');
    await document.send(new PutCommand({ TableName: tables.parkingZones, Item: { zoneId: 'P9', name: 'Override', capacity: 7, capacityEstimated: false, registeredOccupied: 3, currentCount: 6 } }));
    await document.send(new PutCommand({ TableName: tables.parkingZones, Item: { zoneId: 'A', name: 'Legacy' } }));
    await syncParkingZones(tables.parkingZones);
    await syncParkingZones(tables.parkingZones);
    const preserved = await get(tables.parkingZones, { zoneId: 'P9' });
    assert.equal(preserved.registeredOccupied, 3);
    assert.equal(preserved.capacity, 7);
    assert.equal(preserved.capacityEstimated, false);
    assert.equal(preserved.currentCount, 6);
    assert.ok(await get(tables.parkingZones, { zoneId: 'A' }));
    const rows = (await call('GET /parking/zones', 'a')).data;
    assert.equal(rows.filter((row) => /^P\d+$/.test(row.zoneId)).length, 10);
    assert.equal(rows.find((row) => row.zoneId === 'P10').available, 25);
    db.destroy();
  } finally {
    for (const TableName of created) await client.send(new DeleteTableCommand({ TableName }));
    client.destroy();
  }
});
