"""Integration test for the deployed Lambdas (Paso 4).

Invokes each function with the same event API Gateway sends, against the real
DynamoDB tables. Creates test data (and one Cognito user, created without
sending email) and deletes it at the end.

    pip install boto3
    python backend/tests/integration_test.py
"""
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import boto3

REGION = "us-east-1"
POOL = "us-east-1_IypBl72F8"  # UserPoolId output of the aventon-mayab-auth stack
lam = boto3.client("lambda", region_name=REGION)
ddb = boto3.resource("dynamodb", region_name=REGION)
cog = boto3.client("cognito-idp", region_name=REGION)
T = {n: ddb.Table(f"aventon-{n}") for n in ["users", "trips", "seat-requests", "parking-zones", "parking-sessions", "schedules"]}

RUN = uuid.uuid4().hex[:6]
failures = 0


def check(name, cond, extra=""):
    global failures
    if not cond:
        failures += 1
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))


def call(fn, route, user=None, path=None, qs=None, body=None, username=None):
    event = {"routeKey": route, "pathParameters": path, "queryStringParameters": qs,
             "body": json.dumps(body) if body is not None else None, "requestContext": {}}
    if user:
        event["requestContext"]["authorizer"] = {"jwt": {"claims": {
            "sub": user, "email": f"{user}@anahuac.mx", "cognito:username": username or user}}}
    res = lam.invoke(FunctionName=f"aventon-{fn}", Payload=json.dumps(event))
    payload = json.loads(res["Payload"].read())
    if "statusCode" not in payload:
        return 0, payload
    return payload["statusCode"], json.loads(payload["body"])


D, P = f"t{RUN}-driver", [f"t{RUN}-p{i}" for i in range(6)]
tomorrow = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 86400))
colonia = f"Colonia-{RUN}"

print("== Basics")
check("no token -> 401", call("trips", "GET /trips")[0] == 401)
check("unknown route -> 404", call("trips", "GET /nope", D)[0] == 404)
s, b = call("profile", "PUT /me", D, body={"name": "Conductor Prueba", "colonia": "Montebello"})
check("PUT /me", s == 200 and b["email"] == f"{D}@anahuac.mx", b)
s, b = call("profile", "PUT /me", D, body={"name": "Hack", "email": "otro@gmail.com", "userId": "someone-else"})
check("PUT /me ignores userId/email from body", s == 200 and b["userId"] == D and b["email"] == f"{D}@anahuac.mx", b)
check("bad phone -> 400", call("profile", "PUT /me", D, body={"name": "Conductor Prueba", "phone": "12345"})[0] == 400)
s, b = call("profile", "PUT /me", D, body={"name": "Conductor Prueba", "colonia": "Montebello", "phone": "+52 999-111-2233"})
check("phone stored as 10 digits", s == 200 and b["phone"] == "9991112233", b)
for i, p in enumerate(P[:5]):
    call("profile", "PUT /me", p, body={"name": f"Pasajero {i}", "colonia": "Montebello", "phone": f"99922233{i:02d}"})

print("== Trips")
check("bad seats -> 400", call("trips", "POST /trips", D, body={"colonia": colonia, "departureTime": tomorrow, "seatsTotal": 0, "meetingPoint": "x"})[0] == 400)
s, trip = call("trips", "POST /trips", D, body={"colonia": colonia, "departureTime": tomorrow, "seatsTotal": 1, "meetingPoint": "Oxxo de la esquina", "routeDescription": "Por Prolongación Montejo"})
check("create trip", s == 200 and trip["seatsLeft"] == 1 and trip["driver"]["name"] == "Conductor Prueba" and trip["routeDescription"] == "Por Prolongación Montejo", trip)
tid = trip["tripId"]
s, lst = call("trips", "GET /trips", P[0], qs={"colonia": colonia})
check("search by colonia finds it, without meetingPoint", s == 200 and len(lst) == 1 and "meetingPoint" not in lst[0], lst)
check("before a match only the driver's first name is shown", lst and lst[0]["driver"]["name"] == "Conductor", lst)
check("search doesn't show the driver's phone", lst and "phone" not in lst[0]["driver"], lst)
check("driver doesn't see own trip in search", call("trips", "GET /trips", D, qs={"colonia": colonia})[1] == [])
check("request without consent -> 400", call("trips", "POST /trips/{tripId}/requests", P[0], path={"tripId": tid})[0] == 400)
check("driver can't request own trip", call("trips", "POST /trips/{tripId}/requests", D, path={"tripId": tid}, body={"consent": True})[0] == 400)
for p in P[:5]:
    s, b = call("trips", "POST /trips/{tripId}/requests", p, path={"tripId": tid}, body={"consent": True})
    check(f"{p} requests seat", s == 200 and b["status"] == "pending", b)
check("duplicate request -> 409", call("trips", "POST /trips/{tripId}/requests", P[0], path={"tripId": tid}, body={"consent": True})[0] == 409)
s, b = call("trips", "GET /trips/{tripId}", P[0], path={"tripId": tid})
check("pending passenger: no meetingPoint", s == 200 and "meetingPoint" not in b and b["myRequest"]["status"] == "pending", b)
check("after requesting, the passenger sees the driver's full name", b["driver"]["name"] == "Conductor Prueba", b)
check("pending passenger: no driver phone", "phone" not in b["driver"], b)
s, b = call("trips", "GET /trips/{tripId}", D, path={"tripId": tid})
check("driver: no phone for pending passengers", all("phone" not in r["passenger"] for r in b["requests"]), b)
check("passenger can't accept -> 403", call("trips", "POST /trips/{tripId}/requests/{passengerId}/accept", P[0], path={"tripId": tid, "passengerId": P[1]})[0] == 403)

print("== No overbooking: 5 simultaneous accepts, 1 seat")
with ThreadPoolExecutor(5) as pool:
    results = list(pool.map(lambda p: call("trips", "POST /trips/{tripId}/requests/{passengerId}/accept", D, path={"tripId": tid, "passengerId": p}), P[:5]))
ok = [P[i] for i, (s, _) in enumerate(results) if s == 200]
check("exactly one accept succeeded", len(ok) == 1, results)
check("the others got 409", sum(1 for s, _ in results if s == 409) == 4, results)
item = T["trips"].get_item(Key={"tripId": tid}, ConsistentRead=True)["Item"]
check("seatsLeft is 0, not negative", item["seatsLeft"] == 0, item["seatsLeft"])
accepted = ok[0] if ok else P[0]
others = [p for p in P[:5] if p != accepted]
s, b = call("trips", "GET /trips/{tripId}", accepted, path={"tripId": tid})
check("accepted passenger sees meetingPoint", b.get("meetingPoint") == "Oxxo de la esquina", b)
check("accepted passenger sees the driver's phone", b["driver"].get("phone") == "9991112233", b)
s, b = call("trips", "GET /trips/{tripId}", others[0], path={"tripId": tid})
check("non-accepted passenger doesn't", "meetingPoint" not in b, b)
check("non-accepted passenger doesn't see the driver's phone", "phone" not in b["driver"], b)
s, b = call("trips", "GET /trips/{tripId}", D, path={"tripId": tid})
check("driver sees all 5 requests with passenger profiles", len(b.get("requests", [])) == 5 and all("passenger" in r for r in b["requests"]), b)
phones = {r["passengerId"]: r["passenger"].get("phone") for r in b.get("requests", [])}
check("driver sees only the accepted passenger's phone", bool(phones.get(accepted)) and all(v is None for k, v in phones.items() if k != accepted), phones)
check("full trip hidden from search", call("trips", "GET /trips", P[5], qs={"colonia": colonia})[1] == [])
check("reject pending", call("trips", "POST /trips/{tripId}/requests/{passengerId}/reject", D, path={"tripId": tid, "passengerId": others[0]})[0] == 200)
check("reject again -> 409", call("trips", "POST /trips/{tripId}/requests/{passengerId}/reject", D, path={"tripId": tid, "passengerId": others[0]})[0] == 409)

print("== Cancel gives the seat back")
s, b = call("trips", "DELETE /trips/{tripId}/requests", accepted, path={"tripId": tid})
check("accepted passenger cancels", s == 200, b)
item = T["trips"].get_item(Key={"tripId": tid}, ConsistentRead=True)["Item"]
check("seatsLeft back to 1", item["seatsLeft"] == 1, item["seatsLeft"])
check("can request again after cancelling", call("trips", "POST /trips/{tripId}/requests", accepted, path={"tripId": tid}, body={"consent": True})[0] == 200)
check("accept again", call("trips", "POST /trips/{tripId}/requests/{passengerId}/accept", D, path={"tripId": tid, "passengerId": accepted})[0] == 200)

print("== Status")
check("Disponible -> Finalizado not allowed", call("trips", "POST /trips/{tripId}/status", D, path={"tripId": tid}, body={"status": "Finalizado"})[0] == 409)
check("passenger can't change status", call("trips", "POST /trips/{tripId}/status", accepted, path={"tripId": tid}, body={"status": "En curso"})[0] == 403)
check("-> En curso", call("trips", "POST /trips/{tripId}/status", D, path={"tripId": tid}, body={"status": "En curso"})[0] == 200)
statuses = {r["passengerId"]: r["status"] for r in call("trips", "GET /trips/{tripId}", D, path={"tripId": tid})[1]["requests"]}
check("starting the trip rejects pending requests", all(st in ("accepted", "rejected") for st in statuses.values()) and list(statuses.values()).count("accepted") == 1, statuses)
check("can't cancel once the trip started -> 409", call("trips", "DELETE /trips/{tripId}/requests", accepted, path={"tripId": tid})[0] == 409)
check("non-participant can't open a started trip -> 404", call("trips", "GET /trips/{tripId}", P[5], path={"tripId": tid})[0] == 404)
s, b = call("trips", "GET /trips/{tripId}", accepted, path={"tripId": tid})
check("accepted passenger still sees meetingPoint while En curso", "meetingPoint" in b, b)
check("and the driver's phone", "phone" in b["driver"], b)
check("-> Finalizado", call("trips", "POST /trips/{tripId}/status", D, path={"tripId": tid}, body={"status": "Finalizado"})[0] == 200)
s, b = call("trips", "GET /trips/{tripId}", accepted, path={"tripId": tid})
check("meetingPoint hidden once Finalizado", "meetingPoint" not in b, b)
check("driver's phone hidden once Finalizado", "phone" not in b["driver"], b)
s, b = call("trips", "GET /trips/{tripId}", D, path={"tripId": tid})
check("passenger phones hidden from the driver once Finalizado", all("phone" not in r["passenger"] for r in b["requests"]), b)
time.sleep(2)
s, b = call("trips", "GET /me/trips", D)
check("driver /me/trips (with requests)", s == 200 and [t["tripId"] for t in b["asDriver"]] == [tid] and len(b["asDriver"][0]["requests"]) == 5, b)
s, b = call("trips", "GET /me/trips", accepted)
check("passenger /me/trips", s == 200 and len(b["asPassenger"]) == 1 and b["asPassenger"][0]["myRequest"]["status"] == "accepted", b)

print("== Parking")
zone = f"TEST-{RUN}"
T["parking-zones"].put_item(Item={"zoneId": zone, "name": "Zona de prueba", "capacity": 50, "currentCount": 0})
s, zones = call("parking", "GET /parking/zones", P[0])
check("zones list has test zone, sensor offline", s == 200 and any(z["zoneId"] == zone and z["sensorOnline"] is False for z in zones), zones)
check("unknown zone -> 404", call("parking", "POST /parking/entry", P[0], body={"zoneId": "nope"})[0] == 404)
with ThreadPoolExecutor(5) as pool:
    results = list(pool.map(lambda _: call("parking", "POST /parking/entry", P[0], body={"zoneId": zone}), range(5)))
check("5 simultaneous entries -> exactly 1 succeeds", sum(1 for s, _ in results if s == 200) == 1 and sum(1 for s, _ in results if s == 409) == 4, results)
s, b = call("parking", "GET /parking/session", P[0])
check("active session", b["session"]["zoneId"] == zone, b)
check("other student has no session", call("parking", "GET /parking/session", P[1])[1]["session"] is None)
s, b = call("parking", "POST /parking/exit", P[0])
check("exit", s == 200 and b["minutes"] == 0, b)
check("exit again -> 409", call("parking", "POST /parking/exit", P[0])[0] == 409)
check("can enter again after exit", call("parking", "POST /parking/entry", P[0], body={"zoneId": zone})[0] == 200)
call("parking", "POST /parking/exit", P[0])

print("== Schedules")
s, b = call("profile", "PUT /me/schedule/{slotId}", P[0], path={"slotId": "lun-1"}, body={"day": 1, "start": "07:00", "end": "09:00", "subject": "Cálculo"})
check("save slot", s == 200, b)
check("bad time -> 400", call("profile", "PUT /me/schedule/{slotId}", P[0], path={"slotId": "x"}, body={"day": 1, "start": "9:00", "end": "08:00"})[0] == 400)
check("own schedule", len(call("profile", "GET /me/schedule", P[0])[1]) == 1)
check("other student sees only their own (empty)", call("profile", "GET /me/schedule", P[1])[1] == [])
check("delete slot", call("profile", "DELETE /me/schedule/{slotId}", P[0], path={"slotId": "lun-1"})[0] == 200)

print("== Account deletion (real Cognito user)")
email = f"claude.borrar.{RUN}@anahuac.mx"
user = cog.admin_create_user(UserPoolId=POOL, Username=email, MessageAction="SUPPRESS",
                             UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"}])["User"]
R = next(a["Value"] for a in user["Attributes"] if a["Name"] == "sub")
R_username = user["Username"]
call("profile", "PUT /me", R, body={"name": "Borrar"}, username=R_username)
call("profile", "PUT /me/schedule/{slotId}", R, path={"slotId": "a"}, body={"day": 2, "start": "10:00", "end": "11:00"}, username=R_username)
_, rtrip = call("trips", "POST /trips", R, body={"colonia": colonia, "departureTime": tomorrow, "seatsTotal": 2, "meetingPoint": "x"}, username=R_username)
call("trips", "POST /trips/{tripId}/requests", P[5], path={"tripId": rtrip["tripId"]}, body={"consent": True})
_, dtrip = call("trips", "POST /trips", D, body={"colonia": colonia, "departureTime": tomorrow, "seatsTotal": 2, "meetingPoint": "y"})
call("trips", "POST /trips/{tripId}/requests", R, path={"tripId": dtrip["tripId"]}, body={"consent": True}, username=R_username)
call("trips", "POST /trips/{tripId}/requests/{passengerId}/accept", D, path={"tripId": dtrip["tripId"], "passengerId": R})
call("parking", "POST /parking/entry", R, body={"zoneId": zone}, username=R_username)
time.sleep(2)
s, b = call("profile", "DELETE /me", R, username=R_username)
check("DELETE /me", s == 200, b)
check("profile gone", "Item" not in T["users"].get_item(Key={"userId": R}, ConsistentRead=True))
check("schedule gone", T["schedules"].query(KeyConditionExpression="userId = :u", ExpressionAttributeValues={":u": R})["Count"] == 0)
check("parking session gone", "Item" not in T["parking-sessions"].get_item(Key={"userId": R}, ConsistentRead=True))
check("their trip gone", "Item" not in T["trips"].get_item(Key={"tripId": rtrip["tripId"]}, ConsistentRead=True))
check("requests on their trip gone", T["seat-requests"].query(KeyConditionExpression="tripId = :t", ExpressionAttributeValues={":t": rtrip["tripId"]})["Count"] == 0)
check("their seat returned to the other trip", T["trips"].get_item(Key={"tripId": dtrip["tripId"]}, ConsistentRead=True)["Item"]["seatsLeft"] == 2)
try:
    cog.admin_get_user(UserPoolId=POOL, Username=R_username)
    check("Cognito user deleted", False)
except cog.exceptions.UserNotFoundException:
    check("Cognito user deleted", True)

print("== Cleanup")
for t in T["trips"].scan(FilterExpression="colonia = :c", ExpressionAttributeValues={":c": colonia})["Items"]:
    for r in T["seat-requests"].query(KeyConditionExpression="tripId = :t", ExpressionAttributeValues={":t": t["tripId"]})["Items"]:
        T["seat-requests"].delete_item(Key={"tripId": t["tripId"], "passengerId": r["passengerId"]})
    T["trips"].delete_item(Key={"tripId": t["tripId"]})
T["parking-zones"].delete_item(Key={"zoneId": zone})
for u in [D, *P]:
    T["users"].delete_item(Key={"userId": u})
    T["parking-sessions"].delete_item(Key={"userId": u})
counts = {n: t.scan(Select="COUNT")["Count"] for n, t in T.items()}
print("items left per table:", counts)
print(f"\n{failures} failure(s)")
