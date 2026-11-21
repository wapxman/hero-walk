# -*- coding: utf-8 -*-
"""Простой сервер игры для проверок настоящим Chrome: python tools/serve.py [порт]
(обычный python -m http.server держит в очереди 5 соединений — Chrome открывает больше, и часть файлов не грузится)."""
import sys, os, http.server, socketserver
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    request_queue_size = 256; daemon_threads = True
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
S(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8770), H).serve_forever()
