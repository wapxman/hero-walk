# -*- coding: utf-8 -*-
"""Заставки и рассказ: перенос файлов Клауди в игру.
  python tools/cine_install.py          — взять всё из night_19_11/cinema/game/ и положить в hero-walk/cine/
  python tools/cine_install.py --stub   — сначала сделать заглушки для того, чего в папке ещё нет (существующее не трогает)

Что ждём в night_19_11/cinema/game/:
  logo_game.png, logo_paladium.mp4, intro.mp4
  world_01 … world_10 / 1.webp, 2.webp, (3.webp), vo.mp3, text.json     (картинки можно .png/.jpg — переведу в webp)
  finale / 1.webp … N.webp (сколько нужно), vo.mp3, text.json;  finale.mp4 — по желанию
  text.json: { "lines": [ { "t": 0, "text": "…" }, { "t": 4.5, "text": "…" } ] }   t — секунды от начала голоса;
             необязательное "slide": N — с этой строки показывать картинку N
Видео перекодируются в H.264 не больше 1080p со звуком AAC; картинки — в webp не шире 1920.
В игру пишется список cine/index.js — по нему проигрыватель знает, что есть."""
import sys, os, json, shutil, subprocess, io
sys.stdout.reconfigure(encoding='utf-8')
from PIL import Image
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = r'C:\Users\User\Desktop\night_19_11\cinema\game'
DST = os.path.join(ROOT, 'cine')
STUB_MARK = '_заглушки.txt'
WORLDS = ['world_%02d' % i for i in range(1, 11)] + ['finale']

# субтитры заглушек — из story_bible.md Клауди (черновик): по три строки на мир
STORY = {
 'world_01': ['Королевский замок. Первые врата Разлома.', 'Их держит сэр Бранд — Чёрный Рыцарь, первый меч короля.', 'Голос из Разлома обещал вернуть ему семью. Он открыл ворота.'],
 'world_02': ['Горящая деревня. Вторые врата.', 'Доктор Морр продаёт «лекарство» от чумы.', 'Кто не платит — сгорает. Кто платит — умирает от лекарства.'],
 'world_03': ['Осенний лес. Третьи врата.', 'Двести лет назад люди выжгли этот лес под пашни.', 'Сиссара, Королева Змей, ничего не забыла.'],
 'world_04': ['Проклятое болото. Четвёртые врата.', 'Глотт, Король-Жаб, топит деревни ради сокровищ.', 'Когда он смеётся, замолкают даже комары.'],
 'world_05': ['Гномьи шахты. Пятые врата.', 'Гномы ушли сто лет назад. Их страж остался.', 'Он защищает дом — и не знает, что защищать больше некого.'],
 'world_06': ['Ледяные вершины. Шестые врата.', 'Королева Вьюги хочет укрыть мир льдом.', '«Во льду никто не плачет, брат».'],
 'world_07': ['Руины Зеркального города. Седьмые врата.', 'Лорд Аврелий продал свой город за вечную молодость.', 'Жители живы. Они смотрят из зеркал.'],
 'world_08': ['Огненный вулкан. Восьмые врата.', 'Тысячу лет Ксарр был прикован под горой.', 'Ему не нужны ни месть, ни слава. Ему нравится, как горит мир.'],
 'world_09': ['Небесный храм. Девятые врата.', 'Серафин, последний слуга ушедших богов, судит людей.', 'Он до сих пор верит, что был прав.'],
 'world_10': ['Бездна. Последние врата.', 'Здесь ждёт Ардан — отец, у которого боги отняли дочь.', 'Он не хочет нашей смерти. Он хочет, чтобы мы поняли.'],
 'finale': ['Последние врата закрыты.', 'Разлом затих.', 'А над белым городом — впервые за тысячу лет — рассвет.'],
}
ARENA = lambda n: [os.path.join(ROOT, 'arena', f) for f in (['ground.webp', 'arena2.webp', 's2.webp'] if n == 1 else ['w%d_2.webp' % n, 'w%d_3.webp' % n, 'w%d_4.webp' % n])]

def ff(*a):
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *a], capture_output=True, text=True, encoding='utf-8', errors='ignore')
    if r.returncode: print('   ffmpeg:', r.stderr.strip()[-300:])
    return r.returncode == 0

def stub():
    """Заглушки из того, что уже есть в игре: логотип, картинки арен, текст из story_bible. Готовые файлы не трогаем."""
    os.makedirs(SRC, exist_ok=True); made = []
    def need(p): return not os.path.exists(os.path.join(SRC, p))
    if need('logo_game.png'):
        Image.open(os.path.join(ROOT, 'ui', 'logo.webp')).save(os.path.join(SRC, 'logo_game.png')); made.append('logo_game.png')
    font = 'C\\:/Windows/Fonts/georgiab.ttf'
    if need('logo_paladium.mp4'):
        ff('-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=5:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-t', '5',
           '-vf', "drawtext=fontfile='%s':text='PALADIUM':fontcolor=white:fontsize=150:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,1),t,if(gt(t,4),5-t,1))'" % font,
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', os.path.join(SRC, 'logo_paladium.mp4')) and made.append('logo_paladium.mp4')
    if need('intro.mp4'):
        ff('-f', 'lavfi', '-i', 'color=c=0x0b0f18:s=1920x1080:d=6:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-t', '6',
           '-vf', "drawtext=fontfile='%s':text='ВСТУПЛЕНИЕ':fontcolor=0xffd27a:fontsize=110:x=(w-text_w)/2:y=(h-text_h)/2-60,drawtext=fontfile='%s':text='заглушка — видео «книга» пришлёт Клауди':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2+80" % (font, font),
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', os.path.join(SRC, 'intro.mp4')) and made.append('intro.mp4')
    for w in WORLDS:
        d = os.path.join(SRC, w); os.makedirs(d, exist_ok=True)
        if any(os.path.exists(os.path.join(d, '1' + e)) for e in ('.webp', '.png', '.jpg')): continue
        n = 10 if w == 'finale' else int(w[-2:])
        for i, a in enumerate(ARENA(n)):
            if os.path.exists(a): shutil.copy(a, os.path.join(d, '%d.webp' % (i + 1)))
        if not os.path.exists(os.path.join(d, 'text.json')):
            json.dump({'lines': [{'t': i * 7, 'text': t} for i, t in enumerate(STORY[w])]}, io.open(os.path.join(d, 'text.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        made.append(w + '/')
    if made: io.open(os.path.join(SRC, STUB_MARK), 'a', encoding='utf-8').write('Заглушки Клода (заменить своими файлами с теми же именами): ' + ', '.join(made) + '\n')
    print('заглушки:', ', '.join(made) if made else 'не понадобились')

def video(name):
    s = os.path.join(SRC, name)
    if not os.path.exists(s): return 0
    # уже H.264 + AAC не больше 1080p — не пережимаем (качество то же), только переносим начало файла вперёд, чтобы сразу играл
    pr = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,height', '-of', 'csv=p=0', s], capture_output=True, text=True).stdout.split()
    codecs = {x.split(',')[0] for x in pr}; hs = [int(x.split(',')[1]) for x in pr if ',' in x and x.split(',')[1].isdigit()]
    if 'h264' in codecs and codecs <= {'h264', 'aac'} and hs and max(hs) <= 1088:
        return 1 if ff('-i', s, '-c', 'copy', '-movflags', '+faststart', os.path.join(DST, name)) else 0
    ok = ff('-i', s, '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2", '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1',
            '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', os.path.join(DST, name))
    return 1 if ok else 0

def pic(src, dst):
    im = Image.open(src).convert('RGB')
    if im.width > 1920: im = im.resize((1920, round(im.height * 1920 / im.width)), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=84, method=6)

def install():
    if not os.path.isdir(SRC): print('нет папки', SRC); return
    if os.path.isdir(DST): shutil.rmtree(DST)
    os.makedirs(DST); files = {}; rep = []
    s = os.path.join(SRC, 'logo_game.png')
    if os.path.exists(s):
        im = Image.open(s); im.thumbnail((1600, 1600)); im.save(os.path.join(DST, 'logo_game.png'), optimize=True); files['logo_game.png'] = 1
    for v in ('logo_paladium.mp4', 'intro.mp4', 'finale.mp4'):
        if video(v): files[v] = 1
    for w in WORLDS:
        d = os.path.join(SRC, w); n = 0
        if not os.path.isdir(d): rep.append((w, 'нет папки')); continue
        os.makedirs(os.path.join(DST, w), exist_ok=True)
        for i in range(1, 31):
            f = next((os.path.join(d, '%d%s' % (i, e)) for e in ('.webp', '.png', '.jpg', '.jpeg') if os.path.exists(os.path.join(d, '%d%s' % (i, e)))), None)
            if not f: break
            pic(f, os.path.join(DST, w, '%d.webp' % i)); n = i
        vo = 0
        if os.path.exists(os.path.join(d, 'vo.mp3')): shutil.copy(os.path.join(d, 'vo.mp3'), os.path.join(DST, w, 'vo.mp3')); vo = 1
        lines = 0
        if os.path.exists(os.path.join(d, 'text.json')):
            try:
                j = json.load(io.open(os.path.join(d, 'text.json'), encoding='utf-8-sig'))
                L = [dict({'t': float(x['t']), 'text': str(x['text'])}, **({'slide': int(x['slide'])} if x.get('slide') is not None else {})) for x in (j['lines'] if isinstance(j, dict) else j)]
                bad = [x['slide'] for x in L if 'slide' in x and not os.path.exists(os.path.join(DST, w, '%d.webp' % x['slide']))]
                if bad: rep.append((w, 'в text.json slide %s, а таких картинок нет' % bad))
                L.sort(key=lambda x: x['t']); lines = len(L)
                json.dump({'lines': L}, io.open(os.path.join(DST, w, 'text.json'), 'w', encoding='utf-8'), ensure_ascii=False)
            except Exception as e: rep.append((w, 'text.json не читается: %s' % e))
        if n: files[w] = {'n': n, 'vo': vo}
        else: shutil.rmtree(os.path.join(DST, w))
        rep.append((w, 'картинок %d, голос %s, строк субтитров %d' % (n, 'есть' if vo else 'НЕТ', lines)))
    io.open(os.path.join(DST, 'index.js'), 'w', encoding='utf-8', newline='\n').write('// список заставок — пишет tools/cine_install.py, руками не править\nconst CINE_FILES = ' + json.dumps(files, ensure_ascii=False) + ';\n')
    for k in ('logo_game.png', 'logo_paladium.mp4', 'intro.mp4', 'finale.mp4'): print('  %-20s %s' % (k, 'есть' if k in files else 'нет'))
    for w, t in rep: print('  %-20s %s' % (w, t))
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(DST) for f in fs)
    print('в игре cine/: %.1f МБ' % (size / 1048576))
    if os.path.exists(os.path.join(SRC, STUB_MARK)): print('ВНИМАНИЕ: среди файлов есть заглушки — см.', os.path.join(SRC, STUB_MARK))

if '--stub' in sys.argv: stub()
install()
