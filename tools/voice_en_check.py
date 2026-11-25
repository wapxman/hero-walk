# -*- coding: utf-8 -*-
"""Английская озвучка (v123) в настоящей странице (нужен обычный Chrome — в нём есть H.264):
файлы на месте и парные русским; при английском языке ролики книги идут из cine_en/ (каждый — с начала до конца, со звуком),
реплики героев — из sfx_en/, фразы боссов — из sfx_en/bv/; при русском — всё русское; смена языка в игре меняет голоса сразу;
английский файл не загрузился — играет русский. Сервер страниц поднимает сам (порт 8787).
Запуск: python tools/voice_en_check.py     Код выхода 1 — если что-то не прошло."""
import sys, os, re, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8787; BASE = 'http://127.0.0.1:%d/index.html' % PORT
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:600]) if extra and not ok else ''))
    if not ok: bad.append(name)
def probe(f):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,height,duration:format=duration', '-of', 'json', f], capture_output=True, text=True).stdout)
    d = {s['codec_type']: s for s in j['streams']}; return d, float(j['format']['duration'])
print('файлы')
VE = json.loads(open(os.path.join(ROOT, 'voice_en.js'), encoding='utf-8').read().split('const VOICE_EN = ', 1)[1].rstrip().rstrip(';'))
ru_vo = sorted(f[:-4] for f in os.listdir(os.path.join(ROOT, 'sfx')) if re.match(r'^(archer_)?vo_.*\.mp3$', f))
ru_bl = sorted(f[:-4] for f in os.listdir(os.path.join(ROOT, 'sfx', 'bv')) if re.match(r'^b_.*_l\d\.mp3$', f))
chk('реплики героев: у каждой русской (%d) есть английская с тем же именем' % len(ru_vo), sorted(VE['sfx']) == ru_vo and all(os.path.getsize(os.path.join(ROOT, 'sfx_en', n + '.mp3')) > 2000 for n in ru_vo), [x for x in ru_vo if x not in VE['sfx']][:5])
chk('фразы боссов: у каждой русской (%d) есть английская' % len(ru_bl), sorted(VE['bv']) == ru_bl and all(os.path.getsize(os.path.join(ROOT, 'sfx_en', 'bv', n + '.mp3')) > 2000 for n in ru_bl), [x for x in ru_bl if x not in VE['bv']][:5])
chk('в sfx_en нет ничего, кроме голосов (звуки умений и крики мини-боссов — общие)', sorted(f[:-4] for f in os.listdir(os.path.join(ROOT, 'sfx_en')) if f.endswith('.mp3')) == ru_vo and sorted(f[:-4] for f in os.listdir(os.path.join(ROOT, 'sfx_en', 'bv'))) == ru_bl)
FILES = ['intro.mp4'] + ['world_%02d.mp4' % i for i in range(1, 11)] + ['finale.mp4']; DUR = {}
for f in FILES:
    d, dur = probe(os.path.join(ROOT, 'cine_en', f)); DUR[f] = dur
    chk('%s: H.264 + AAC, 720p, картинка и звук одной длины (%.1f с; русский — %.1f с)' % (f, dur, probe(os.path.join(ROOT, 'cine', f))[1]),
        d['video']['codec_name'] == 'h264' and d['audio']['codec_name'] == 'aac' and int(d['video']['height']) == 720 and abs(float(d['video']['duration']) - float(d['audio']['duration'])) < 1.0 and dur > 20, d)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
WATCH = """(file) => { window.__v = { first: null, max: 0, ended: false, closedAt: null, dur: 0, src: '', snd: 0, jumps: 0, last: 0 }; const o = window.__v;
  const tick = () => { const c = document.getElementById('cine'), v = c && c.style.display === 'block' ? c.querySelector('video') : null;
    if (v && v.src.indexOf(file) >= 0) { if (!v.__w) { v.__w = 1; v.addEventListener('ended', () => { o.ended = true; }); }
      if (v.currentTime > 0 && o.first == null) { o.first = v.currentTime; o.dur = v.duration; o.src = v.src; v.playbackRate = 16; }
      if (v.currentTime > o.max) o.max = v.currentTime; if (v.currentTime < o.last - 0.5) o.jumps++; o.last = v.currentTime; o.snd = v.webkitAudioDecodedByteCount || 0; o.muted = v.muted; }
    else if (o.first != null && o.closedAt == null) o.closedAt = o.max;
    if (o.closedAt == null) requestAnimationFrame(tick); }; tick(); }"""
def run(p, f, start, want_dir, dur):
    p.evaluate(WATCH, f); p.evaluate(start); t0 = time.time()
    while time.time() - t0 < 90:
        o = p.evaluate("__v")
        if o['closedAt'] is not None: break
        p.wait_for_timeout(250)
    p.wait_for_timeout(900); o = p.evaluate("__v")
    ok = o['first'] is not None and o['first'] < 0.6 and ('/' + want_dir + '/' + f) in o['src'] and abs(o['dur'] - dur) < 0.5 and o['max'] >= dur - 0.6 and o['ended'] and o['jumps'] == 0 and o['snd'] > 1000 and not p.evaluate("CINE.on")
    return ok, o
def boot(p, q):
    p.goto(BASE + '?' + q, timeout=120000); p.wait_for_function("typeof CINE !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000)
    p.wait_for_timeout(7000); p.mouse.click(640, 360); p.wait_for_timeout(1500); p.mouse.click(640, 360); p.wait_for_timeout(1500); p.mouse.click(640, 360)
    p.wait_for_function("(() => { const v = document.querySelector('#cine video'); return v && v.src.indexOf('intro.mp4') >= 0 && v.currentTime > 0.3; })()", timeout=30000)
    src = p.evaluate("document.querySelector('#cine video').src")
    p.evaluate("document.querySelector('#cine .skip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))"); p.wait_for_function("!CINE.on", timeout=15000); p.wait_for_timeout(1500)
    return src
def page(br, q):
    cx = br.new_context(viewport={'width': 1280, 'height': 720}); p = cx.new_page(); p.errs = []; p.req = []
    p.on('pageerror', lambda e: p.errs.append(str(e)[:200])); p.on('request', lambda r: p.req.append(r.url.split('?')[0].split('/', 3)[3]) if re.search(r'/(sfx|sfx_en|cine|cine_en)/', r.url) else None)
    return cx, p
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
        print('английский язык')
        cx, p = page(br, ''); src = boot(p, 'cine=1&lang=en&allworlds&fakestore=web')
        chk('пролог при запуске — английский (cine_en/intro.mp4)', '/cine_en/intro.mp4' in src, src)
        chk('лого студии и лого игры — общие (cine/)', 'cine/logo_paladium.mp4' in p.req and not any(x.startswith('cine_en/logo') for x in p.req), [x for x in p.req if 'logo' in x])
        for f in FILES:
            ok, o = run(p, f, "CINE.replay('%s')" % f, 'cine_en', DUR[f])
            chk('%s — английский, с начала и до конца (%.1f из %.1f с), звук идёт' % (f, o['max'], DUR[f]), ok, o)
        p.wait_for_timeout(3000)
        vo = sorted(set(x for x in p.req if re.match(r'^sfx(_en)?/(archer_)?vo_', x)))
        chk('реплики героев загружены из sfx_en/ — все %d, русские не запрашивались' % len(ru_vo), sorted(x for x in vo if x.startswith('sfx_en/')) == ['sfx_en/' + n + '.mp3' for n in ru_vo] and not [x for x in vo if x.startswith('sfx/')], [len(vo), [x for x in vo if x.startswith('sfx/')][:3]])
        chk('остальные звуки — общие, из sfx/', any(x.startswith('sfx/hit_') for x in p.req) and not any(x.startswith('sfx_en/hit') for x in p.req))
        d_en = p.evaluate("Object.fromEntries(Object.keys(SND).filter(n => /^(archer_)?vo_/.test(n)).map(n => [n, +SND[n].duration.toFixed(3)]))")
        chk('голоса раскодированы (все %d)' % len(ru_vo), len(d_en) == len(ru_vo), len(d_en))
        # босс: фразы — английские, звуки умений — общие
        p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Новая игра').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"); p.wait_for_timeout(1000)
        p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
        p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); p.wait_for_timeout(1000)
        p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
        t0 = time.time()
        while time.time() - t0 < 40 and not p.evaluate("SHOP.phase === 'fight' && !SHOP.paused && !CINE.on"):
            if p.evaluate("!!document.querySelector('#cine .skip') && CINE.on"): p.evaluate("document.querySelector('#cine .skip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))")
            p.wait_for_timeout(500)
        n0 = len(p.req); p.evaluate("(() => { window.__god = setInterval(() => { P.hp = P.maxHp; }, 50); spawnEnemy('b_blackknight'); })()"); p.wait_for_timeout(3500)
        bv = sorted(set(x for x in p.req[n0:] if '/bv/' in x))
        chk('босс вышел: его фразы — из sfx_en/bv/, звуки умений — из sfx/bv/', all(('sfx_en/bv/b_blackknight_l%d.mp3' % i) in bv for i in (1, 2, 3)) and any(re.match(r'^sfx/bv/b_blackknight_s', x) for x in bv) and not any(re.match(r'^sfx/bv/b_blackknight_l', x) for x in bv) and not any(re.match(r'^sfx_en/bv/.*_s', x) for x in bv), bv)
        tx = p.evaluate("LANG.t('«' + BOSSVO.b_blackknight.l[0] + '»')"); chk('подпись фразы босса — те же слова, что говорит голос («Knight of chaos!»)', 'Knight of chaos!' in tx, tx)
        print('смена языка в игре')
        n0 = len(p.req); p.evaluate("LANG.set('ru')"); p.wait_for_timeout(4000)
        back = sorted(set(x for x in p.req[n0:] if re.match(r'^sfx(_en)?/', x)))
        d_ru = p.evaluate("Object.fromEntries(Object.keys(SND).filter(n => /^(archer_)?vo_/.test(n)).map(n => [n, +SND[n].duration.toFixed(3)]))")
        diff = sum(1 for n in d_en if abs(d_en[n] - d_ru.get(n, 0)) > 0.02)
        chk('переключили на русский — голоса героев перезагружены из sfx/ (запросов %d), в памяти теперь русские (другая длина у %d из %d)' % (len(back), diff, len(d_en)), len([x for x in back if re.match(r'^sfx/(archer_)?vo_', x)]) == len(ru_vo) and not [x for x in back if x.startswith('sfx_en/') and '/bv/' not in x] and diff > len(d_en) * 0.8, [len(back), diff])
        chk('фразы босса на арене перезагружены русские', all(('sfx/bv/b_blackknight_l%d.mp3' % i) in back for i in (1, 2, 3)), [x for x in back if '/bv/' in x])
        ok, o = run(p, 'world_05.mp4', "CINE.replay('world_05.mp4')", 'cine', probe(os.path.join(ROOT, 'cine', 'world_05.mp4'))[1]); chk('ролик после переключения — русский (cine/world_05.mp4)', ok, o)
        chk('ошибок на странице нет', not p.errs, p.errs[:3]); cx.close()

        print('русский язык')
        cx, p = page(br, ''); src = boot(p, 'cine=1&lang=ru&fakestore=web'); p.wait_for_timeout(3000)
        chk('при русском языке ничего английского не запрашивается (ни роликов, ни голосов)', '/cine/intro.mp4' in src and not [x for x in p.req if x.startswith('sfx_en/') or x.startswith('cine_en/')] and len([x for x in p.req if re.match(r'^sfx/(archer_)?vo_', x)]) == len(ru_vo), [x for x in p.req if '_en/' in x][:5])
        chk('ошибок на странице нет', not p.errs, p.errs[:3]); cx.close()

        print('английского файла нет — играет русский')
        cx, p = page(br, '')
        cx.route(re.compile(r'/sfx_en/vo_attack_1\.mp3|/cine_en/world_02\.mp4|/sfx_en/bv/b_blackknight_l1\.mp3'), lambda route: route.fulfill(status=404, body='нет'))
        boot(p, 'cine=1&lang=en&allworlds&fakestore=web'); p.wait_for_timeout(3000)
        s = p.evaluate("({ a1: !!SND.vo_attack_1, a2: !!SND.vo_attack_2 })")
        chk('реплика без английского файла взята русская (sfx/vo_attack_1.mp3), остальные — английские', s['a1'] and s['a2'] and 'sfx/vo_attack_1.mp3' in p.req and 'sfx/vo_attack_2.mp3' not in p.req, [s, [x for x in p.req if 'vo_attack_1' in x or 'vo_attack_2' in x]])
        ok, o = run(p, 'world_02.mp4', "CINE.replay('world_02.mp4')", 'cine', probe(os.path.join(ROOT, 'cine', 'world_02.mp4'))[1])
        chk('ролик без английского файла идёт русский — с начала и до конца, со звуком', ok and 'cine_en/world_02.mp4' in p.req, o)
        chk('ошибок на странице нет', not p.errs, p.errs[:3]); cx.close(); br.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
