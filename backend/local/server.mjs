// Runs the API on your machine: the real Lambdas from backend/src, against DynamoDB Local.
// Nothing touches AWS. See backend/local/README.md.
//
//   docker run -d --name aventon-ddb -p 8000:8000 amazon/dynamodb-local:2.5.4
//   node backend/local/server.mjs            # API on http://localhost:4000
import { readFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const DYNAMODB = process.env.DYNAMODB_URL ?? "http://localhost:8000";

// Same table names the Lambdas get in template.yaml. DynamoDB Local accepts any credentials.
Object.assign(process.env, {
  AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
  AWS_ACCESS_KEY_ID: "local",
  AWS_SECRET_ACCESS_KEY: "local",
  AWS_ENDPOINT_URL_DYNAMODB: DYNAMODB,
  USERS_TABLE: "aventon-users",
  TRIPS_TABLE: "aventon-trips",
  SEAT_REQUESTS_TABLE: "aventon-seat-requests",
  PARKING_ZONES_TABLE: "aventon-parking-zones",
  PARKING_SESSIONS_TABLE: "aventon-parking-sessions",
  SCHEDULES_TABLE: "aventon-schedules",
});

// The SDK is installed in backend/src (npm install there), next to the Lambdas.
const fromSrc = createRequire(join(here, "../src/package.json"));
const { CreateTableCommand, DynamoDBClient } = await import(
  pathToFileURL(fromSrc.resolve("@aws-sdk/client-dynamodb")).href
);

// Keys and indexes from backend/infra/dynamodb.yaml.
const TABLES = [
  { name: "aventon-users", key: ["userId"] },
  { name: "aventon-trips", key: ["tripId"], indexes: { byColonia: ["colonia", "departureTime"], byDriver: ["driverId", "departureTime"] } },
  { name: "aventon-seat-requests", key: ["tripId", "passengerId"], indexes: { byPassenger: ["passengerId"] } },
  { name: "aventon-parking-zones", key: ["zoneId"] },
  { name: "aventon-parking-sessions", key: ["userId"] },
  { name: "aventon-schedules", key: ["userId", "slotId"] },
];

const schema = (names) => names.map((AttributeName, i) => ({ AttributeName, KeyType: i ? "RANGE" : "HASH" }));

async function createTables() {
  const client = new DynamoDBClient({});
  for (const { name, key, indexes = {} } of TABLES) {
    const attributes = [...new Set([key, ...Object.values(indexes)].flat())];
    try {
      await client.send(
        new CreateTableCommand({
          TableName: name,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: attributes.map((AttributeName) => ({ AttributeName, AttributeType: "S" })),
          KeySchema: schema(key),
          ...(Object.keys(indexes).length && {
            GlobalSecondaryIndexes: Object.entries(indexes).map(([IndexName, k]) => ({
              IndexName,
              KeySchema: schema(k),
              Projection: { ProjectionType: "ALL" },
            })),
          }),
        }),
      );
      console.log(`Tabla creada: ${name}`);
    } catch (err) {
      if (err.name !== "ResourceInUseException") throw err;
    }
  }
}

// Routes straight from template.yaml: "Handler: trips.handler" + "Method: GET, Path: /trips".
function readRoutes() {
  const template = readFileSync(join(here, "../template.yaml"), "utf8");
  const routes = [];
  let handler;
  for (const line of template.split("\n")) {
    const fn = /^\s+Handler: ([\w-]+)\.handler/.exec(line);
    if (fn) handler = fn[1];
    // Paths with {params} are quoted in the template; plain ones aren't.
    const route = /Method: (\w+), Path: (?:"([^"]+)"|([^\s,}]+))/.exec(line);
    if (route && handler) {
      const [, method, quoted, plain] = route;
      const path = quoted ?? plain;
      const names = [];
      const pattern = new RegExp(
        "^" + path.replace(/\{(\w+)\}/g, (_, n) => (names.push(n), "([^/]+)")) + "$",
      );
      routes.push({ method, path, names, pattern, handler });
    }
  }
  return routes;
}

// Like API Gateway's JWT authorizer, but only reads the token: the signature is not checked here.
function claimsOf(req) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return null;
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,PUT,DELETE",
};

await createTables();
const routes = readRoutes();
const handlers = {};
for (const name of new Set(routes.map((r) => r.handler))) {
  handlers[name] = (await import(join(here, "../src", `${name}.mjs`))).handler;
}

http
  .createServer(async (req, res) => {
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { ...CORS, "content-type": "application/json", ...headers });
      res.end(body);
    };
    if (req.method === "OPTIONS") return send(204, "");
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let body = "";
    for await (const chunk of req) body += chunk;

    const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    if (!route) {
      console.log(`${req.method} ${url.pathname} → 404 (no está en template.yaml)`);
      return send(404, JSON.stringify({ message: "Not Found" }));
    }
    const claims = claimsOf(req);
    if (!claims) return send(401, JSON.stringify({ message: "Unauthorized" }));

    const match = route.pattern.exec(url.pathname);
    const result = await handlers[route.handler]({
      routeKey: `${route.method} ${route.path}`,
      pathParameters: route.names.length
        ? Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(match[i + 1])]))
        : undefined,
      queryStringParameters: url.searchParams.size ? Object.fromEntries(url.searchParams) : undefined,
      body: body || undefined,
      requestContext: { authorizer: { jwt: { claims } } },
    });
    console.log(`${req.method} ${url.pathname} → ${result.statusCode}`);
    send(result.statusCode, result.body, result.headers);
  })
  .listen(PORT, () =>
    console.log(`API local en http://localhost:${PORT} (${routes.length} rutas, DynamoDB en ${DYNAMODB})`),
  );
