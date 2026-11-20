"""Голоса боссов и звуки умений (Клауди, 20.11): boss_voice/final/MAP.json (боссы: 3 фразы + звуки умений) и
boss_voice/mini/final/MAP.json (мини-боссы: крик при выходе + звуки умений) -> sfx/bv/*.mp3 и bossvo_map.js.
usage: python tools/bossvo_import.py"""
import json, os, shutil, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "C:/Users/User/Desktop/boss_voice"
out = {}; code = ""
for f in ["combat.js", "bossmech.js", "enemies.js", "sk_defs.js", "mini.js"]: code += open(os.path.join(ROOT, f), encoding="utf-8").read()
miss = []
def skills(vid, sfx, ent):
    for i, (name, s) in enumerate(sfx.items(), 1):
        key = re.sub(r"\s*\(.*\)$", "", name).strip()
        shutil.copyfile(s["file"], os.path.join(ROOT, "sfx", "bv", "%s_s%d.mp3" % (vid, i)))
        ent["s"][key] = i
        if ("'" + key + "!'") not in code and ("'" + key + "'") not in code: miss.append(vid + ": " + key)
for vid, v in json.load(open(SRC + "/final/MAP.json", encoding="utf-8")).items():
    ent = out[vid] = {"l": [], "s": {}}
    for i, l in enumerate(v["lines"], 1):
        shutil.copyfile(l["file"], os.path.join(ROOT, "sfx", "bv", "%s_l%d.mp3" % (vid, i))); ent["l"].append(l["text"])
    skills(vid, v["sfx"], ent)
for vid, v in json.load(open(SRC + "/mini/final/MAP.json", encoding="utf-8")).items():
    ent = out[vid] = {"g": 1, "s": {}}
    shutil.copyfile(v["growl"]["file"], os.path.join(ROOT, "sfx", "bv", "%s_g.mp3" % vid))
    skills(vid, v["sfx"], ent)
with open(os.path.join(ROOT, "bossvo_map.js"), "w", encoding="utf-8", newline="") as fh:
    fh.write("// Создано tools/bossvo_import.py: голоса боссов (l — фразы: выход, каст, добивание), крик мини-босса (g), звуки умений (s: имя -> номер файла).\n")
    fh.write("const BOSSVO = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
sys.stdout.reconfigure(encoding="utf-8")
print(len(out), "персонажей,", len(os.listdir(os.path.join(ROOT, "sfx", "bv"))), "файлов; имён умений нет в коде:", miss)
