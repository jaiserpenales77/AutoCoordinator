#!/usr/bin/env python3
"""Adds entries to the Packaging Lead Hub's Stored Data, the way a Lead would.

Signs in as the account in PK030_USERNAME / PK030_PASSWORD (Firebase Auth,
username@pk030.local), reads pk030/storedData, adds only the entries that
aren't stored yet (never changes or removes one), writes one Activity Log
entry per entry added, then reads the data back to confirm. Standard library
only.

  python3 tools/pk030_db.py show fgItems            # or bulkItems / lineRates
  python3 tools/pk030_db.py add entries.json --dry-run
  python3 tools/pk030_db.py add entries.json

entries.json uses the app's Stored Data export format (any part may be left
out):
  {"fgItems":   [{"item": "2676", "count": 180}],
   "items":     [{"item": "BU001565", "pieceWt": 1781}],
   "lineRates": [{"line": "10", "fgItem": "2676", "fullHour": 3000,
                  "lunch": 1500, "break": null}]}

The password and the sign-in token are never printed. For testing against the
Firestore emulator, set PK030_EMULATOR=host:port (and PK030_PROJECT); sign-in
is then skipped.
"""
import json
import os
import random
import re
import string
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMAIN = "pk030.local"
EMULATOR = os.environ.get("PK030_EMULATOR", "")
PROJECT = os.environ.get("PK030_PROJECT", "demo-pk030" if EMULATOR else "jde-schedule-database")
DB = f"projects/{PROJECT}/databases/(default)"
BASE = (f"http://{EMULATOR}" if EMULATOR else "https://firestore.googleapis.com") + f"/v1/{DB}/documents"

# Field: (label for messages, Activity Log action, unit).
FIELDS = {"fgItems": ("FG items", "Added an FG item", ""),
          "bulkItems": ("bulk items", "Added a bulk item", " mg"),
          "lineRates": ("line rates", "Added a line rate", "")}


class Fail(Exception):
    pass


def http(method, url, body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    # The emulator is local; real calls go through the environment's proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({})) if EMULATOR else urllib.request.build_opener()
    try:
        with opener.open(req, timeout=30) as res:
            return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        try:
            msg = json.loads(err.read()).get("error", {})
            msg = msg.get("message") if isinstance(msg, dict) else msg
        except Exception:
            msg = err.reason
        raise Fail(f"{method} {url.split('?')[0].split('/v1/')[-1]} failed: {err.code} {msg}") from None
    except urllib.error.URLError as err:
        raise Fail(f"Can't reach {urllib.parse.urlparse(url).netloc}: {err.reason}. "
                   "The environment's network policy may need to allow it.") from None


def api_key():
    text = open(os.path.join(ROOT, "cloud-sync.js"), encoding="utf-8").read()
    match = re.search(r'apiKey:\s*"([^"]+)"', text)
    if not match:
        raise Fail("Couldn't find the web API key in cloud-sync.js.")
    return match.group(1)


def sign_in():
    """Returns (token, uid, username)."""
    username = os.environ.get("PK030_USERNAME", "").strip().lower()
    password = os.environ.get("PK030_PASSWORD", "")
    if not username or (not password and not EMULATOR):
        raise Fail("Set PK030_USERNAME and PK030_PASSWORD in the environment settings "
                   "(a new session picks them up).")
    if EMULATOR:
        uid = "u-" + username
        claims = {"iss": f"https://securetoken.google.com/{PROJECT}", "aud": PROJECT, "sub": uid,
                  "user_id": uid, "email": f"{username}@{DOMAIN}", "iat": int(time.time()),
                  "exp": int(time.time()) + 3600, "auth_time": int(time.time()),
                  "firebase": {"sign_in_provider": "password", "identities": {}}}
        enc = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
        return f"{enc({'alg': 'none', 'typ': 'JWT'})}.{enc(claims)}.", uid, username
    try:
        res = http("POST", "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + api_key(),
                   {"email": f"{username}@{DOMAIN}", "password": password, "returnSecureToken": True})
    except Fail as err:
        if "INVALID_LOGIN_CREDENTIALS" in str(err) or "INVALID_PASSWORD" in str(err) or "EMAIL_NOT_FOUND" in str(err):
            raise Fail(f"Sign-in refused for {username}: wrong username or password.") from None
        raise
    return res["idToken"], res["localId"], username


# --- Firestore values

def decode(v):
    if "mapValue" in v:
        return {k: decode(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return float(v["doubleValue"])
    if "nullValue" in v:
        return None
    if "stringValue" in v:
        return v["stringValue"]
    if "booleanValue" in v:
        return v["booleanValue"]
    return v


def encode(x):
    if x is None:
        return {"nullValue": None}
    if isinstance(x, bool):
        return {"booleanValue": x}
    if isinstance(x, int) or (isinstance(x, float) and x.is_integer()):
        return {"integerValue": str(int(x))}
    if isinstance(x, float):
        return {"doubleValue": x}
    if isinstance(x, dict):
        return {"mapValue": {"fields": {k: encode(v) for k, v in x.items()}}}
    return {"stringValue": str(x)}


def field_path(field, key):
    return f"{field}.`" + key.replace("\\", "\\\\").replace("`", "\\`") + "`"


def read_stored(token):
    try:
        doc = http("GET", f"{BASE}/pk030/storedData", token=token)
    except Fail as err:
        if " 404 " in str(err):
            return {}
        raise
    return {k: decode(v) for k, v in doc.get("fields", {}).items()}


# --- Entries (normalised the way the app does)

def number(v, what, allow_none=False, allow_zero=False):
    if v is None or v == "":
        if allow_none:
            return None
        raise Fail(f"{what} is missing.")
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise Fail(f"{what} isn't a number: {v!r}") from None
    if n != n or n in (float("inf"), float("-inf")) or n < 0 or (n == 0 and not allow_zero):
        raise Fail(f"{what} must be {'0 or more' if allow_zero else 'more than 0'}: {v!r}")
    return int(n) if n.is_integer() else n


def norm_item(s):
    return str(s or "").strip().upper()


def norm_line(s):
    return " ".join(str(s or "").split()).upper()


def wanted_entries(data):
    """{field: {key: value}} from an export-format file."""
    out = {f: {} for f in FIELDS}
    for i in data.get("fgItems", []):
        key = norm_item(i.get("item"))
        if not key:
            raise Fail(f"FG item without a name: {i}")
        out["fgItems"][key] = number(i.get("count"), f"Count for {key}")
    for i in data.get("items", data.get("bulkItems", [])):
        key = norm_item(i.get("item"))
        if not key:
            raise Fail(f"Bulk item without a name: {i}")
        out["bulkItems"][key] = number(i.get("pieceWt"), f"Piece weight for {key}")
    for r in data.get("lineRates", []):
        line, fg = norm_line(r.get("line")), norm_item(r.get("fgItem"))
        if not line or not fg or "|" in line + fg:
            raise Fail(f"Line rate needs a line and an FG item, without '|': {r}")
        key = f"{line}|{fg}"
        out["lineRates"][key] = {"fullHour": number(r.get("fullHour"), f"Full Hour for {key}", allow_zero=True),
                                 "lunch": number(r.get("lunch"), f"Lunch for {key}", True, True),
                                 "break": number(r.get("break"), f"Break for {key}", True, True)}
    return out


def fmt(n):
    if n is None:
        return "—"
    return f"{n:,}" if isinstance(n, int) else f"{n:,.3f}".rstrip("0").rstrip(".")


def describe(field, key, value):
    """The Activity Log detail, as the app writes it."""
    if field == "lineRates":
        line, fg = key.split("|", 1)
        return (f"Line {line}, FG {fg}: full hour {fmt(value['fullHour'])}, "
                f"lunch {fmt(value['lunch'])}, break {fmt(value['break'])}")
    return f"{key}: {value}{FIELDS[field][2]}"


def same(a, b):
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    return a == b if a is None or b is None else float(a) == float(b)


# --- Commands

def show(field):
    if field not in FIELDS:
        raise Fail(f"Pick one of: {', '.join(FIELDS)}")
    token, _, username = sign_in()
    print(json.dumps(read_stored(token).get(field, {}), indent=2, sort_keys=True, ensure_ascii=False))
    print(f"(read as {username})", file=sys.stderr)


def add(path, dry_run):
    with open(path, encoding="utf-8") as f:
        wanted = wanted_entries(json.load(f))
    token, uid, username = sign_in()
    stored = read_stored(token)
    plan = {f: {"add": {}, "same": [], "differs": {}} for f in FIELDS}
    for field, entries in wanted.items():
        have = stored.get(field, {})
        for key, value in entries.items():
            if key not in have:
                plan[field]["add"][key] = value
            elif same(have[key], value):
                plan[field]["same"].append(key)
            else:
                plan[field]["differs"][key] = (have[key], value)

    adds = [(f, k, v) for f in FIELDS for k, v in plan[f]["add"].items()]
    if adds and not dry_run:
        mask = "&".join("updateMask.fieldPaths=" + urllib.parse.quote(field_path(f, k)) for f, k, _ in adds)
        fields = {}
        for f, k, v in adds:
            fields.setdefault(f, {})[k] = v
        try:
            http("PATCH", f"{BASE}/pk030/storedData?{mask}",
                 {"fields": {f: encode(entries) for f, entries in fields.items()}}, token)
        except Fail as err:
            if " 403 " in str(err):
                raise Fail(f"The database refused the change for {username}: the account must be a Lead "
                           "(or Admin/Owner) in the app's Admin tab, and someone may have stored one of these "
                           "in the meantime. Nothing was changed.") from None
            raise
        # One Activity Log entry per entry added, timed by the server.
        writes = []
        for f, k, v in adds:
            doc_id = "".join(random.choices(string.ascii_letters + string.digits, k=20))
            writes.append({"update": {"name": f"{DB}/documents/pk030-activity/{doc_id}",
                                      "fields": {"uid": encode(uid), "username": encode(username),
                                                 "action": encode(FIELDS[f][1]),
                                                 "detail": encode(describe(f, k, v)[:300])}},
                           "currentDocument": {"exists": False},
                           "updateTransforms": [{"fieldPath": "at", "setToServerValue": "REQUEST_TIME"}]})
        try:
            for i in range(0, len(writes), 400):
                http("POST", f"{BASE}:commit", {"writes": writes[i:i + 400]}, token)
        except Fail as err:
            print(f"Warning: added the entries, but couldn't write the Activity Log: {err}", file=sys.stderr)
        after = read_stored(token)
        missing = [k for f, k, v in adds if not same(after.get(f, {}).get(k), v)]
        if missing:
            raise Fail(f"Read back after saving, these aren't as expected: {', '.join(missing)}")

    print(f"{'DRY RUN (nothing saved)' if dry_run else 'Saved'} as {username}:")
    for field, p in plan.items():
        if not (p["add"] or p["same"] or p["differs"]):
            continue
        label = FIELDS[field][0]
        print(f"\n{label[0].upper() + label[1:]}:")
        for key, value in p["add"].items():
            print(f"  {'would add' if dry_run else 'added'}    {describe(field, key, value)}")
        for key in p["same"]:
            print(f"  already stored (same)  {key}")
        for key, (have, value) in p["differs"].items():
            print(f"  NOT CHANGED, stored value differs  {key}: stored {have}, file {value}")
    print(f"\n{len(adds)} to add, {sum(len(p['same']) for p in plan.values())} already stored, "
          f"{sum(len(p['differs']) for p in plan.values())} stored with a different value (left alone).")


def main(argv):
    try:
        if len(argv) >= 2 and argv[0] == "show":
            show(argv[1])
        elif len(argv) >= 2 and argv[0] == "add":
            add(argv[1], "--dry-run" in argv[2:])
        else:
            print(__doc__.strip())
            return 2
    except Fail as err:
        print(f"Error: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
