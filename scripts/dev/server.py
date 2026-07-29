#!/usr/bin/env python3
"""Static dev server that refuses to let the browser cache anything.

`python -m http.server` sends Last-Modified, so browsers happily reuse cached ES modules
across edits. During a session where the library and the page change every few minutes
that produces the worst possible symptom: a page that looks current, reports no error,
and runs yesterday's JavaScript. Every check here runs against the files on disk and
cannot see it.

No-store removes the possibility entirely, which is worth more in dev than the caching is.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8291
    ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
