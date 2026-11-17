"""Рендер персонажа Mixamo: каждая анимация лежит в своём FBX вместе с моделью."""
import bpy, sys, math, os, json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
cfg = json.load(open(argv[0], encoding="utf-8"))
out = cfg["out"]
os.makedirs(out, exist_ok=True)
RES = cfg.get("res", 256)
ORTHO = cfg.get("ortho", 3.8)
ZC = cfg.get("zc", 0.9)
EL = math.radians(cfg.get("el", 35))
dirs = cfg.get("dirs", [0, 1, 2, 3, 4])

for key, fname, n, loop in cfg["anims"]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(cfg["dir"], fname))
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    act = arm.animation_data.action
    for o in list(bpy.data.objects):
        # реквизит без привязки к скелету (например, стрела у ног) в кадр не берём
        if o.type == "MESH" and not any(m.type == "ARMATURE" for m in o.modifiers):
            print("DROP", o.name)
            bpy.data.objects.remove(o, do_unlink=True)
    if cfg.get("tex"):
        # перекрашенная текстура вместо родной
        new = bpy.data.images.load(cfg["tex"])
        for m in bpy.data.materials:
            if m.use_nodes:
                for nd in m.node_tree.nodes:
                    if nd.type == "TEX_IMAGE" and nd.image:
                        nd.image = new
    if cfg.get("texmap"):
        # перекрашенные текстуры по имени картинки
        loaded = {k: bpy.data.images.load(v) for k, v in cfg["texmap"].items()}
        for m in bpy.data.materials:
            if m.use_nodes:
                for nd in m.node_tree.nodes:
                    if nd.type == "TEX_IMAGE" and nd.image and nd.image.name in loaded:
                        nd.image = loaded[nd.image.name]
    f0, f1 = act.frame_range
    for m in bpy.data.materials:
        if not m.use_nodes or cfg.get("rich"):
            continue
        bs = m.node_tree.nodes.get("Principled BSDF")
        if bs:
            bs.inputs["Roughness"].default_value = 0.8
            bs.inputs["Metallic"].default_value = 0.0
            for nm in ("Specular IOR Level", "Specular"):
                if nm in bs.inputs:
                    bs.inputs[nm].default_value = 0.15
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        sc.render.engine = "BLENDER_EEVEE"
    sc.render.film_transparent = True
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (1, 1, 1, 1)
    bg.inputs[1].default_value = cfg.get("amb", 0.85)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = cfg.get("sun", 2.4)
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = cfg.get("ortho_by", {}).get(key, ORTHO)
    cam.data.clip_end = 200
    piv = bpy.data.objects.new("piv", None)
    sc.collection.objects.link(piv)
    piv.location = (0, 0, ZC)
    cam.parent = piv
    sun.parent = piv
    cam.location = (0, -20 * math.cos(EL), 20 * math.sin(EL))
    cam.rotation_euler = (math.pi / 2 - EL, 0, 0)
    sun.rotation_euler = (math.radians(48), 0, math.radians(-35))
    if cfg.get("rich"):
        # ключевой свет ярче, общая подсветка слабее, сзади холодный контровой свет: рельеф и блики читаются
        bg.inputs[1].default_value = cfg.get("amb", 0.42)
        sun.data.energy = cfg.get("sun", 3.4)
        sun.data.angle = math.radians(8)
        rim = bpy.data.objects.new("rim", bpy.data.lights.new("rim", "SUN"))
        rim.data.energy = 3.0
        rim.data.color = (0.62, 0.8, 1.0)
        sc.collection.objects.link(rim)
        rim.parent = piv
        rim.rotation_euler = (math.radians(118), 0, math.radians(150))
        fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
        fill.data.energy = 0.9
        fill.data.color = (1.0, 0.9, 0.78)
        sc.collection.objects.link(fill)
        fill.parent = piv
        fill.rotation_euler = (math.radians(60), 0, math.radians(70))
    hips = next((b for b in arm.pose.bones if b.name.lower().endswith("hips")), None)
    a, b = cfg.get("range", {}).get(key, [0, 1])
    g0 = f0 + (f1 - f0) * a
    g1 = f0 + (f1 - f0) * b
    base = arm.location.copy()
    for i in range(n):
        fr = g0 + i * (g1 - g0) / (n if loop else max(1, n - 1))
        arm.location = base
        sc.frame_set(int(fr), subframe=fr - int(fr))
        if hips:
            # бег на месте: убираем смещение таза по горизонтали
            bpy.context.view_layer.update()
            wpos = arm.matrix_world @ hips.head
            arm.location = (base.x - wpos.x, base.y - wpos.y, base.z)
        for d in dirs:
            piv.rotation_euler = (0, 0, math.radians(-45 * d))
            sc.render.filepath = os.path.join(out, f"{key}_d{d}_f{i}.png")
            bpy.ops.render.render(write_still=True)
    print("ANIM_OK", key, f0, f1)
print("RENDER_OK")
