import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { db, tables } from '../src/lib/db.mjs';
import { handler } from '../src/parking.mjs';
import { presentZone, leaveParking } from '../src/lib/parking-store.mjs';
import { handler as profileHandler } from '../src/profile.mjs';

const require = createRequire(new URL('../src/package.json', import.meta.url));
const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');

Object.assign(tables, { users: 'users', parkingZones: 'zones', parkingSessions: 'sessions' });
const event = (routeKey, body, userId = 'student') => ({
  routeKey, body: body === undefined ? undefined : JSON.stringify(body),
  requestContext: { authorizer: { jwt: { claims: { sub: userId } } } },
});
const zone = { zoneId: 'P9', name: 'Subway - Central', capacity: 35, registeredOccupied: 2 };
const conflict = () => Object.assign(new Error('condition'), {
  name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
});

test('unauthenticated calls and invalid zone bodies do not touch DynamoDB', async () => {
  const spy = mock.method(db, 'send', () => { throw new Error('Unexpected database call'); });
  try {
    assert.equal((await handler({ routeKey: 'GET /parking/zones' })).statusCode, 401);
    for (const body of [null, {}, [], { zoneId: '' }, { zoneId: '../P9' }, { zoneId: 9 }]) {
      assert.equal((await handler(event('POST /parking/entry', body))).statusCode, 400);
    }
    assert.equal(spy.mock.callCount(), 0);
  } finally { spy.mock.restore(); }
});

test('zones are paginated, naturally sorted, and use registered counts rather than sensors', async () => {
  let page = 0;
  const spy = mock.method(db, 'send', async (command) => {
    assert.equal(command.input.ConsistentRead, true);
    return page++ === 0
      ? { Items: [{ ...zone, zoneId: 'P10', currentCount: 30 }], LastEvaluatedKey: { zoneId: 'P10' } }
      : { Items: [{ ...zone, zoneId: 'P2' }] };
  });
  try {
    const result = await handler(event('GET /parking/zones'));
    const rows = JSON.parse(result.body);
    assert.deepEqual(rows.map((row) => row.zoneId), ['P2', 'P10']);
    assert.equal(rows[1].occupied, 2);
    assert.equal(rows[1].available, 33);
    assert.equal(rows[1].source, 'registrado');
    assert.equal(presentZone({ zoneId: 'legacy', capacity: 10, currentCount: 9 }).occupied, null);
    assert.equal(presentZone({ ...zone, capacity: 0 }).available, null);
  } finally { spy.mock.restore(); }
});

test('entry atomically checks profile, creates private session and increments capacity-limited zone', async () => {
  let transaction;
  const spy = mock.method(db, 'send', async (command) => {
    if (command.constructor.name === 'GetCommand') return { Item: zone };
    transaction = command.input.TransactItems;
    return {};
  });
  try {
    const result = await handler(event('POST /parking/entry', { zoneId: 'P9', userId: 'someone-else' }));
    assert.equal(result.statusCode, 200);
    const session = JSON.parse(result.body).session;
    assert.equal(session.userId, 'student');
    assert.equal(session.occupancyCounted, true);
    assert.ok(session.sessionId);
    assert.equal(transaction.length, 3);
    assert.match(transaction[0].ConditionCheck.ConditionExpression, /deletingAt/);
    assert.equal(transaction[1].Put.Item.userId, 'student');
    assert.match(transaction[1].Put.ConditionExpression, /attribute_not_exists/);
    assert.match(transaction[2].Update.ConditionExpression, /registeredOccupied < #capacity/);
    assert.equal(transaction[2].Update.Key.zoneId, 'P9');
  } finally { spy.mock.restore(); }
});

test('missing/uninitialized zones and conditional transaction failures are actionable', async () => {
  let item;
  const spy = mock.method(db, 'send', async (command) => {
    if (command.constructor.name === 'GetCommand') return { Item: item };
    throw conflict();
  });
  try {
    assert.equal((await handler(event('POST /parking/entry', { zoneId: 'P9' }))).statusCode, 404);
    item = { zoneId: 'P9', capacity: 35 };
    assert.equal((await handler(event('POST /parking/entry', { zoneId: 'P9' }))).statusCode, 409);
    item = zone;
    assert.equal((await handler(event('POST /parking/entry', { zoneId: 'P9' }))).statusCode, 409);
  } finally { spy.mock.restore(); }
});

test('exit decrements original session zone and guards the session version', async () => {
  let transaction;
  const session = { userId: 'student', zoneId: 'P10', sessionId: 'original', enteredAt: new Date().toISOString(), occupancyCounted: true };
  const spy = mock.method(db, 'send', async (command) => {
    if (command.constructor.name === 'GetCommand') return { Item: session };
    transaction = command.input.TransactItems;
    return {};
  });
  try {
    const result = await handler(event('POST /parking/exit', { zoneId: 'P9' }));
    assert.equal(result.statusCode, 200);
    assert.equal(transaction[0].Delete.ExpressionAttributeValues[':version'], 'original');
    assert.equal(transaction[1].Update.Key.zoneId, 'P10');
    assert.match(transaction[1].Update.ConditionExpression, /registeredOccupied >= :one/);
  } finally { spy.mock.restore(); }
});

test('legacy session exits never decrement the new counter; missing sessions conflict', async () => {
  let session = { userId: 'student', zoneId: 'A', enteredAt: '2026-01-01T00:00:00Z' };
  const spy = mock.method(db, 'send', async (command) => {
    if (command.constructor.name === 'GetCommand') return { Item: session };
    assert.equal(command.input.TransactItems.length, 1);
    assert.match(command.input.TransactItems[0].Delete.ConditionExpression, /attribute_not_exists\(sessionId\)/);
    return {};
  });
  try {
    assert.equal((await handler(event('POST /parking/exit'))).statusCode, 200);
    session = undefined;
    assert.equal((await handler(event('POST /parking/exit'))).statusCode, 409);
    assert.equal(await leaveParking('student', { allowMissing: true }), null);
  } finally { spy.mock.restore(); }
});

test('account deletion blocks new entries before atomically releasing a counted session', async () => {
  const calls = [];
  const spy = mock.method(db, 'send', async (command) => {
    calls.push(command);
    if (command.constructor.name === 'QueryCommand') return { Items: [] };
    if (command.constructor.name === 'GetCommand') return { Item: { userId: 'student', zoneId: 'P9', sessionId: 'v1', enteredAt: '2026-01-01T00:00:00Z', occupancyCounted: true } };
    return {};
  });
  const cognito = mock.method(CognitoIdentityProviderClient.prototype, 'send', async () => ({}));
  try {
    assert.equal((await profileHandler(event('DELETE /me'))).statusCode, 200);
    assert.match(calls[0].input.UpdateExpression, /deletingAt/);
    const transaction = calls.find((command) => command.constructor.name === 'TransactWriteCommand');
    assert.equal(transaction.input.TransactItems[1].Update.Key.zoneId, 'P9');
    assert.ok(calls.findIndex((command) => command.constructor.name === 'DeleteCommand' && command.input.TableName === 'users') > calls.indexOf(transaction));
  } finally { spy.mock.restore(); cognito.mock.restore(); }
});
