# -*- coding: utf-8 -*-
"""Ролики книги идут с самого начала и доигрывают до конца (v119): пролог, 10 роликов миров, финал — и первый показ,
и пересмотр через «Историю». Каждый ролик действительно проигрывается целиком в настоящей странице (обычный Chrome — в нём
есть H.264), ускоренно ×16, чтобы проверка шла минуты, а не полчаса. Смотрим: первый кадр — у самого начала; время дошло до
конца файла; ролик закрылся сам по событию конца, а не раньше; после него игра идёт дальше.
Ещё сверяются файлы в cine/ с исходниками Клауди (размер и длина) и длина звука и картинки внутри каждого файла (ffprobe).
Запуск: python tools/cine_full.py      сервер страниц поднимает сам (порт 8779). Код выхода 1 — если что-то не прошло."""
import sys, os, time, subprocess, hashlib, json
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8779
SRC = r'C:\Users\User\Desktop\night_19_11\cinema\story_book\game'
FILES = ['intro.mp4'] + ['world_%02d.mp4' % i for i in range(1, 11)] + ['finale.mp4']
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:300]) if extra and not ok else ''))
    if not ok: bad.append(name)
sha = lambda f: hashlib.sha1(open(f, 'rb').read()).hexdigest()
def probe(f):
    try:
        j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', f], capture_output=True, text=True).stdout)
        d = {s['codec_type']: float(s.get('duration', 0)) for s in j['streams']}; d['all'] = float(j['format']['duration']); return d
    except Exception: return None

print('файлы')
DUR = {}
for f in FILES:
    a = os.path.join(ROOT, 'cine', f); b = os.path.join(SRC, f); pr = probe(a); DUR[f] = pr['all'] if pr else 0
    ps = probe(b) if os.path.exists(b) else None      # при установке (cine_install.py) файл перекладывается для быстрого старта — байты другие, содержимое то же: сверяем размер и длину
    same = ps is not None and os.path.getsize(a) == os.path.getsize(b) and abs(ps['all'] - pr['all']) < 0.01 and abs(ps.get('audio', 0) - pr.get('audio', 0)) < 0.01
    chk('%s: размер и длина — как в пакете Клауди; картинка %.1f с, звук %.1f с' % (f, pr.get('video', 0) if pr else 0, pr.get('audio', 0) if pr else 0),
        (same or not os.path.exists(SRC)) and pr is not None and abs(pr.get('video', 0) - pr.get('audio', 0)) < 1.0 and pr['all'] > 20, [same, pr])

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
# следим за роликом изнутри страницы: каждый кадр пишем время; на первом кадре включаем ускорение
WATCH = """(file) => { window.__v = { file, first: null, max: 0, ended: false, closedAt: null, dur: 0, src: '', done: window.__v_done || false, jumps: 0, last: 0 }; const o = window.__v;
  const tick = () => { const c = document.getElementById('cine'), v = c && c.style.display === 'block' ? c.querySelector('video') : null;
    if (v && v.src.indexOf(file) >= 0) { if (!v.__w) { v.__w = 1; v.addEventListener('ended', () => { o.ended = true; }); }
      if (v.currentTime > 0 && o.first == null) { o.first = v.currentTime; o.dur = v.duration; o.src = v.src; v.playbackRate = 16; }
      if (v.currentTime > o.max) o.max = v.currentTime; if (v.currentTime < o.last - 0.5) o.jumps++; o.last = v.currentTime; }
    else if (o.first != null && o.closedAt == null) o.closedAt = o.max;
    if (o.closedAt == null) requestAnimationFrame(tick); }; tick(); }"""
def run(p, f, how, start):
    p.evaluate("window.__d = 0"); p.evaluate(WATCH, f); p.evaluate(start)
    t0 = time.time()
    while time.time() - t0 < 90:
        o = p.evaluate("__v")
        if o['closedAt'] is not None: break
        time.sleep(0.25)
    time.sleep(0.9); o = p.evaluate("__v"); d = p.evaluate("({ d: window.__d, on: CINE.on, paused: SHOP.paused })"); dur = DUR[f]
    ok = o['first'] is not None and o['first'] < 0.6 and abs(o['dur'] - dur) < 0.5 and o['max'] >= dur - 0.6 and o['ended'] and o['jumps'] == 0 and not d['on'] and (d['d'] == 1 or how.startswith('История'))
    chk('%s, %s: с начала (первый кадр на %.2f с) и до конца (%.1f из %.1f с), закрылся сам, игра идёт дальше' % (f, how, o['first'] or -1, o['max'], dur), ok, [o, d])
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
        cx = br.new_context(viewport={'width': 1280, 'height': 720}); p = cx.new_page(); errs = []; p.on('pageerror', lambda e: errs.append(str(e)[:200]))
        p.goto('http://127.0.0.1:%d/index.html?cine=1' % PORT, timeout=120000); p.wait_for_function("typeof CINE !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000)
        time.sleep(7); p.mouse.click(640, 360); time.sleep(1.5); p.mouse.click(640, 360); time.sleep(2.5)
        print('первый показ')
        run(p, 'intro.mp4', 'первый показ', "CINE.reset(); CINE.intro(() => { window.__d = 1; })")
        for i in range(1, 11): run(p, 'world_%02d.mp4' % i, 'первый показ', "CINE.reset(); CINE.world(%d, () => { window.__d = 1; })" % i)
        run(p, 'finale.mp4', 'первый показ', "CINE.reset(); CINE.finale(() => { window.__d = 1; })")
        print('пересмотр через «Историю»')
        for f in FILES: run(p, f, 'История', "CINE.replay('%s')" % f)
        # прерванный и начатый заново ролик снова идёт с начала
        p.evaluate("CINE.replay('world_03.mp4')"); time.sleep(3.5); mid = p.evaluate("document.querySelector('#cine video').currentTime"); p.evaluate("CINE.skip()"); time.sleep(1.5)
        chk('ролик мира 3 пропущен на середине (%.1f с)' % mid, mid > 1 and not p.evaluate("CINE.on"), mid)
        run(p, 'world_03.mp4', 'История, после пропуска на середине', "CINE.replay('world_03.mp4')")
        chk('ошибок страницы нет', not errs, errs[:3]); br.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
