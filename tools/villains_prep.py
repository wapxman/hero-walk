"""Злодеи и боссы из ChatGPT (конвейер Клауди): C:/Users/User/Desktop/villains/<id>/game/ -> игра.
usage: python tools/villains_prep.py shadowwolf sporeshaman ... b_thornqueen   (из корня репозитория)
- листы <id>_walk/attack/death/idle(/cast1/cast2).png копируются в chars/src/vl_<id>_<anim>.png (исходники, в APK не идут);
- атласы — tools/pack_chars.py, WebP без потерь, разрешение не меняется;
- картинки заклинаний vfx1/vfx2.png -> fx/vfx_<id>_1.webp, _2.webp (без потерь);
- chars/villains.js — таблица листов: клетка, линия ног, кадры, темп, ряды (из meta.json художника) и рост из roster.py."""
import json, os, shutil, subprocess, sys, importlib.util
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = "C:/Users/User/Desktop/villains"
ROSTER = "C:/Users/User/browser-tools/roster.py"
sys.path.insert(0, "C:/Users/User/browser-tools")   # roster.py подмешивает новых боссов из roster_night.py
spec = importlib.util.spec_from_file_location("roster", ROSTER); roster = importlib.util.module_from_spec(spec); spec.loader.exec_module(roster)
AN = {"walk": "run", "attack": "atk", "death": "die", "idle": "idle", "cast1": "cast1", "cast2": "cast2"}

lj = os.path.join(ROOT, "chars", "src", "lossless.json")
lossless = json.load(open(lj, encoding="utf-8")) if os.path.exists(lj) else {}
vj = os.path.join(ROOT, "chars", "villains.json")
table = json.load(open(vj, encoding="utf-8")) if os.path.exists(vj) else {}
names = []
for vid in sys.argv[1:]:
    g = os.path.join(SRC_DIR, vid, "game")
    meta = json.load(open(os.path.join(g, "meta.json"), encoding="utf-8"))
    ent = {"size": roster.R[vid]["size"], "nm": roster.R[vid]["ru"], "mul": {}, "vfx": []}
    for an, m in meta.items():
        if an.startswith("vfx"):
            n = an[3:]
            Image.open(os.path.join(g, m["file"])).convert("RGBA").save(
                os.path.join(ROOT, "fx", "vfx_%s_%s.webp" % (vid, n)), lossless=True, quality=100, method=6, exact=True)
            ent["vfx"].append({"img": "fx/vfx_%s_%s.webp" % (vid, n), "how": m["how"]})
            continue
        name = "vl_%s_%s" % (vid, an)
        shutil.copyfile(os.path.join(g, "%s_%s.png" % (vid, an)), os.path.join(ROOT, "chars", "src", name + ".png"))
        lossless[name] = m["cell"]; names.append(name)
        ent["mul"][AN[an]] = {"at": name, "n": m["frames"], "ms": m["ms"], "rows": m["rows"], "foot": m["foot"]}
    table[vid] = ent
json.dump(lossless, open(lj, "w", encoding="utf-8"), indent=1)
json.dump(table, open(vj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
with open(os.path.join(ROOT, "chars", "villains.js"), "w", encoding="utf-8") as fh:
    fh.write("// Создано tools/villains_prep.py из meta.json и roster.py: листы злодеев и боссов из ChatGPT.\n")
    fh.write("const VILLAINS = " + json.dumps(table, ensure_ascii=False, separators=(",", ":")) + ";\n")
subprocess.check_call([sys.executable, os.path.join(ROOT, "tools", "pack_chars.py")] + names)
