# -*- coding: utf-8 -*-
"""Английская озвучка (v123, Клауди 26.11): файлы → игра, рядом с русскими.
    python tools/voice_en_install.py
Откуда (night_19_11/cinema/story_book):  game_en/*.mp4 — ролики книги;  voice_en/sfx_en/*.mp3 — реплики героев (vo_* — Ganfaul,
archer_vo_* — Эйра);  voice_en/sfx_en/bv/*.mp3 — фразы боссов (b_<босс>_l1..3).
Куда:  cine_en/ (ролики; только начало файла переносится вперёд, чтобы сразу играл — без пережатия),  sfx_en/,  sfx_en/bv/.
Список того, что есть по-английски, пишется в voice_en.js (const VOICE_EN) — игра берёт английский файл только из этого списка,
остальное — русское. Файл, которому нет русской пары с тем же именем, не кладётся (и печатается)."""
import sys, os, io, json, shutil, subprocess
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.expanduser('~'), 'Desktop', 'night_19_11', 'cinema', 'story_book')
out = {'sfx': {}, 'bv': {}, 'cine': {}}; skipped = []
def copy_set(src, ru, dst, key, ok):
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith('.mp3'): continue
        n = f[:-4]
        if not os.path.exists(os.path.join(ru, f)) or not ok(n): skipped.append(os.path.join(os.path.basename(src), f)); continue
        shutil.copyfile(os.path.join(src, f), os.path.join(dst, f)); out[key][n] = 1
copy_set(os.path.join(SRC, 'voice_en', 'sfx_en'), os.path.join(ROOT, 'sfx'), os.path.join(ROOT, 'sfx_en'), 'sfx', lambda n: n.startswith('vo_') or n.startswith('archer_vo_'))
copy_set(os.path.join(SRC, 'voice_en', 'sfx_en', 'bv'), os.path.join(ROOT, 'sfx', 'bv'), os.path.join(ROOT, 'sfx_en', 'bv'), 'bv', lambda n: n.startswith('b_') and n[-3:-1] == '_l')
os.makedirs(os.path.join(ROOT, 'cine_en'), exist_ok=True)
for f in ['intro.mp4', 'finale.mp4'] + ['world_%02d.mp4' % i for i in range(1, 11)]:
    s = os.path.join(SRC, 'game_en', f)
    if not os.path.exists(s) or not os.path.exists(os.path.join(ROOT, 'cine', f)): skipped.append('game_en/' + f); continue
    pr = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,height', '-of', 'csv=p=0', s], capture_output=True, text=True).stdout.split()
    codecs = {x.split(',')[0] for x in pr}
    if not ('h264' in codecs and codecs <= {'h264', 'aac'}): print('  НЕ ВЗЯТ (не H.264 + AAC):', f, pr); skipped.append('game_en/' + f); continue
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', s, '-c', 'copy', '-movflags', '+faststart', os.path.join(ROOT, 'cine_en', f)], capture_output=True, text=True)
    if r.returncode: print('  ffmpeg:', r.stderr[-200:]); skipped.append('game_en/' + f); continue
    out['cine'][f] = 1
io.open(os.path.join(ROOT, 'voice_en.js'), 'w', encoding='utf-8', newline='\n').write(
    '// Что в игре озвучено по-английски (пишет tools/voice_en_install.py, руками не править): sfx_en/, sfx_en/bv/, cine_en/.\nconst VOICE_EN = ' + json.dumps(out, separators=(',', ':'), sort_keys=True) + ';\n')
size = lambda d: sum(os.path.getsize(os.path.join(p, f)) for p, _, fs in os.walk(os.path.join(ROOT, d)) for f in fs) / 1e6
print('реплик героев: %d · фраз боссов: %d · роликов: %d' % (len(out['sfx']), len(out['bv']), len(out['cine'])))
print('sfx_en: %.1f МБ · cine_en: %.1f МБ' % (size('sfx_en'), size('cine_en')))
if skipped: print('не положено:', skipped)
