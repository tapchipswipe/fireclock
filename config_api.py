#!/usr/bin/env python3
"""FireClock config API — GET / returns user.json, PUT / saves it.
Runs in a small python:3-alpine container; writes the NAS-mounted file."""
import json, os, socketserver, http.server

FILE = "/data/user.json"

class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body):
        if isinstance(body, str):
            b = body.encode()
            ct = "application/json"
        else:
            b = json.dumps(body).encode()
            ct = "application/json"
        self.send_response(code)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self._send(204, "{}")

    def do_GET(self):
        try:
            with open(FILE) as f:
                data = json.load(f)
        except Exception as e:
            data = {"error": str(e)}
        self._send(200, data)

    def do_PUT(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(n) if n else b"{}"
            obj = json.loads(raw)
            # Write in-place (the file is bind-mounted by fireclock too, so an
            # atomic os.replace() would fail with "Resource busy").
            with open(FILE, "w") as f:
                json.dump(obj, f, indent=2)
            self._send(200, {"ok": True})
        except Exception as e:
            self._send(400, {"error": str(e)})

    def log_message(self, *a):
        pass

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True

if __name__ == "__main__":
    Server(("0.0.0.0", 8787), Handler).serve_forever()