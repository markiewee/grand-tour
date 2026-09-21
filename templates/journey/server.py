"""A journey, served locally for rehearsal.

    python3 server.py                 # http://0.0.0.0:8780
    python3 server.py --https         # https://0.0.0.0:8781 as well (needs tls/cert.pem and tls/key.pem)

Serves public/ and a small JSON API. Everything it stores lives in data/ (git-ignored):
    data/overrides.json  envelopes the sender has opened early or held back
    data/letters.json    letters from the letterbox, media files in data/media/
    data/events.json     when each envelope was opened, and whether it was answered (never the words)
    data/key_token.txt   the secret for the key page, made on first run

This is the rehearsal and development server. It trusts ?t= (a rehearsal time) so the whole trip
can be played through before Friday. A public deployment must drop that and gate letters on real time.
"""
import argparse
import json
import mimetypes
import os
import re
import secrets
import ssl
import sys
import threading
import time
import uuid
from datetime import datetime
from email.parser import BytesParser
from email.policy import default as email_policy
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
MEDIA = DATA / "media"
LOCK = threading.Lock()
MAX_UPLOAD = 200 * 1024 * 1024
def midnight_ms():
    """The moment the letters come down, read from the journey file every time it is asked for.

    The file is the one thing a forker edits, and the server is often left running while they do,
    so it is cheaper to re-read it than to explain why a restart is needed.
    """
    try:
        j = json.loads((PUBLIC / "data" / "trip.json").read_text("utf-8")).get("journey", {})
        at = (j.get("midnight") or {}).get("at")
        return int(datetime.fromisoformat(at).timestamp() * 1000) if at else None
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def read_json(name, fallback):
    p = DATA / name
    if not p.exists():
        return fallback
    try:
        return json.loads(p.read_text("utf-8"))
    except json.JSONDecodeError:
        return fallback


def write_json(name, value):
    p = DATA / name
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=1), "utf-8")
    os.replace(tmp, p)


def key_token():
    p = DATA / "key_token.txt"
    if not p.exists():
        p.write_text(secrets.token_urlsafe(18), "utf-8")
    return p.read_text("utf-8").strip()


def demo_letters():
    """The letters a demo journey carries in its own file.

    A demo has nobody to write to it, and a midnight with nothing coming down is the one screen
    that does not survive being shown empty. On a real journey there is no demo flag and this is
    always an empty list.
    """
    try:
        j = json.loads((PUBLIC / "data" / "trip.json").read_text("utf-8")).get("journey", {})
    except (OSError, ValueError, json.JSONDecodeError):
        return []
    if not j.get("demo"):
        return []
    return [{"id": f"demo{n:02d}", "from": l.get("from", ""), "text": l.get("text", ""),
             "audio": None, "video": None, "last": bool(l.get("last")), "at": n}
            for n, l in enumerate(j.get("demoLetters") or [])]


def public_letter(l):
    return {k: l.get(k) for k in ("id", "from", "text", "audio", "video", "last", "at")}


def parse_multipart(ctype, body):
    head = f"Content-Type: {ctype}\r\nMIME-Version: 1.0\r\n\r\n".encode()
    msg = BytesParser(policy=email_policy).parsebytes(head + body)
    fields, files = {}, {}
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        data = part.get_payload(decode=True) or b""
        if part.get_filename():
            if data:
                files[name] = (part.get_filename(), part.get_content_type(), data)
        else:
            fields[name] = data.decode("utf-8", "replace")
    return fields, files


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(PUBLIC), **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        path = urlparse(self.path).path
        if path.endswith((".html", ".js", ".json", ".webmanifest", ".css")) or path == "/":
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # ---------- helpers ----------
    def send_json(self, value, status=HTTPStatus.OK):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_UPLOAD:
            raise ValueError("That file is too big. Keep videos under a minute.")
        return self.rfile.read(n) if n else b""

    def json_body(self):
        raw = self.body()
        return json.loads(raw.decode("utf-8")) if raw else {}

    def query(self):
        return {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}

    def is_key(self, payload=None):
        k = (payload or {}).get("k") or self.query().get("k") or self.headers.get("X-Key")
        return bool(k) and secrets.compare_digest(k, key_token())

    # ---------- routes ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/state":
            return self.state()
        if path == "/api/key":
            return self.key_view()
        if path.startswith("/media/"):
            return self.media(path[len("/media/"):])
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/events":
                return self.add_event()
            if path == "/api/letters":
                return self.add_letter()
            if path == "/api/key/override":
                return self.set_override()
            if path == "/api/key/letter":
                return self.set_letter()
        except ValueError as e:
            return self.send_json({"error": str(e)}, HTTPStatus.BAD_REQUEST)
        self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def state(self):
        q = self.query()
        now = int(q.get("t") or time.time() * 1000)
        letters = []
        mid = midnight_ms()
        if mid is not None and now >= mid:
            letters = [public_letter(l) for l in read_json("letters.json", []) if not l.get("hidden")]
            letters += demo_letters()
            letters.sort(key=lambda l: (bool(l.get("last")), l.get("at", 0)))
        self.send_json({
            "overrides": read_json("overrides.json", {}),
            "letters": letters,
        })

    def key_view(self):
        if not self.is_key():
            return self.send_json({"error": "This page needs the key link."}, HTTPStatus.FORBIDDEN)
        self.send_json({
            "overrides": read_json("overrides.json", {}),
            "letters": read_json("letters.json", []),
            "events": read_json("events.json", []),
        })

    def media(self, name):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            return self.send_error(HTTPStatus.NOT_FOUND)
        p = MEDIA / name
        if not p.exists():
            return self.send_error(HTTPStatus.NOT_FOUND)
        data = p.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mimetypes.guess_type(name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Accept-Ranges", "none")
        self.end_headers()
        self.wfile.write(data)

    def add_event(self):
        e = self.json_body()
        if not re.fullmatch(r"[a-z0-9]{1,24}", str(e.get("id", ""))) or e.get("type") not in ("opened", "answered"):
            raise ValueError("Bad event")
        with LOCK:
            events = read_json("events.json", [])
            events.append({"id": e["id"], "type": e["type"], "at": int(e.get("at") or time.time() * 1000)})
            write_json("events.json", events[-500:])
        self.send_json({"ok": True})

    def add_letter(self):
        ctype = self.headers.get("Content-Type", "")
        # On Vercel the recordings go straight to Blob storage and only their addresses are posted,
        # so the letterbox sends JSON. Here that means a written letter works locally; a voice note
        # or a video needs the deployed site, which is the only place with somewhere to put it.
        if ctype.startswith("application/json"):
            p = self.json_body()
            if p.get("audio") or p.get("video"):
                raise ValueError("Recordings need the deployed site. This one only takes written letters.")
            fields, files = {"from": p.get("from") or "", "text": p.get("text") or ""}, {}
        elif ctype.startswith("multipart/form-data"):
            fields, files = parse_multipart(ctype, self.body())
        else:
            raise ValueError("Send the letter as JSON or as a form.")
        name = (fields.get("from") or "").strip()[:60]
        text = (fields.get("text") or "").strip()[:6000]
        if not name:
            raise ValueError("Add your name so they know who it is from.")
        if not (text or files):
            raise ValueError("Write something, or record a voice note or a video.")
        letter = {"id": uuid.uuid4().hex[:10], "from": name, "text": text, "audio": None, "video": None,
                  "last": False, "hidden": False, "at": int(time.time() * 1000)}
        MEDIA.mkdir(parents=True, exist_ok=True)
        for kind in ("audio", "video"):
            if kind in files:
                fname, mime, data = files[kind]
                ext = (mimetypes.guess_extension(mime) or os.path.splitext(fname)[1] or ".bin").lstrip(".")
                ext = {"oga": "ogg", "mpga": "mp3", "qt": "mov"}.get(ext, ext)
                stored = f"{letter['id']}_{kind}.{ext}"
                (MEDIA / stored).write_bytes(data)
                letter[kind] = f"media/{stored}"
        with LOCK:
            letters = read_json("letters.json", [])
            letters.append(letter)
            write_json("letters.json", letters)
        self.send_json({"ok": True, "id": letter["id"]})

    def set_override(self):
        p = self.json_body()
        if not self.is_key(p):
            return self.send_json({"error": "This page needs the key link."}, HTTPStatus.FORBIDDEN)
        with LOCK:
            o = read_json("overrides.json", {})
            if p.get("mode") in ("open", "hold"):
                o[p["id"]] = p["mode"]
            else:
                o.pop(p["id"], None)
            write_json("overrides.json", o)
        self.send_json({"ok": True})

    def set_letter(self):
        p = self.json_body()
        if not self.is_key(p):
            return self.send_json({"error": "This page needs the key link."}, HTTPStatus.FORBIDDEN)
        with LOCK:
            letters = read_json("letters.json", [])
            for l in letters:
                if l["id"] == p.get("id"):
                    if "hidden" in p:
                        l["hidden"] = bool(p["hidden"])
                    if "last" in p:
                        l["last"] = bool(p["last"])
                    if p.get("delete"):
                        l["deleted"] = True
            letters = [l for l in letters if not l.get("deleted")]
            write_json("letters.json", letters)
        self.send_json({"ok": True})


def serve(port, tls=None):
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    if tls:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(*tls)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    httpd.serve_forever()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8780)
    ap.add_argument("--https", action="store_true", help="also serve https on port+1 with tls/cert.pem and tls/key.pem")
    a = ap.parse_args()
    DATA.mkdir(exist_ok=True)
    tok = key_token()
    threads = [threading.Thread(target=serve, args=(a.port,), daemon=True)]
    print(f"The journey  http://localhost:{a.port}/")
    print(f"Letterbox    http://localhost:{a.port}/letterbox.html")
    print(f"Your key     http://localhost:{a.port}/key.html?k={tok}")
    if a.https:
        cert, key = ROOT / "tls" / "cert.pem", ROOT / "tls" / "key.pem"
        threads.append(threading.Thread(target=serve, args=(a.port + 1, (str(cert), str(key))), daemon=True))
        print(f"https        https://<this-mac>:{a.port + 1}/  (tilt needs https on the phone)")
    for t in threads:
        t.start()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
