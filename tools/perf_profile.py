# -*- coding: utf-8 -*-
"""Профиль: на что уходит время кадра (аудит скорости, v120). Страница уже открыта и стоит в нужном месте (карта миров, бой):
    python tools/perf_profile.py [порт отладки, по умолчанию 9333 — приложение на эмуляторе; 9334 — Chrome из tools/perf.py] [секунд]
Печатает функции игры по убыванию собственного времени и долю простоя."""
import sys, json, time, urllib.request, collections
import websocket
sys.stdout.reconfigure(encoding='utf-8')
port = int(sys.argv[1]) if len(sys.argv) > 1 else 9333; sec = float(sys.argv[2]) if len(sys.argv) > 2 else 6
pages = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % port))
pg = [x for x in pages if x.get('type') == 'page' and ('duelarena.app' in x['url'] or '127.0.0.1' in x['url'])][0]
ws = websocket.create_connection(pg['webSocketDebuggerUrl'], suppress_origin=True, timeout=120); n = 0
def cmd(m, p=None):
    global n; n += 1; ws.send(json.dumps({'id': n, 'method': m, 'params': p or {}}))
    while True:
        r = json.loads(ws.recv())
        if r.get('id') == n: return r.get('result', {})
cmd('Profiler.enable'); cmd('Profiler.setSamplingInterval', {'interval': 500}); cmd('Profiler.start'); time.sleep(sec)
pr = cmd('Profiler.stop')['profile']; nodes = {x['id']: x for x in pr['nodes']}; dt = pr['timeDeltas']; self_t = collections.Counter()
for sid, d in zip(pr['samples'], dt):
    f = nodes[sid]['callFrame']; self_t[(f['functionName'] or '(анонимная)', f['url'].split('/')[-1].split('?')[0], f['lineNumber'] + 1)] += d
tot = sum(self_t.values())
print('всего %.1f с; по убыванию собственного времени:' % (tot / 1e6))
for (fn, url, line), t in self_t.most_common(28): print('  %5.1f %%  %-28s %s:%s' % (100 * t / tot, fn[:28], url, line))
