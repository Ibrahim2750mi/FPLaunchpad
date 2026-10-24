from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os


class IsolatedPageHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


port = int(os.environ.get("PORT", "8001"))
handler = partial(IsolatedPageHandler, directory=os.getcwd())
server = ThreadingHTTPServer(("127.0.0.1", port), handler)
print(f"Lean Stepper running at http://127.0.0.1:{port}")
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
