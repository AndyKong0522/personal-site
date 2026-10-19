"""Colour an untextured, part-segmented Tripo export (tripo2.glb, 37 parts) after the v1 2D design.

blender --background --python tools/blender-colorize.py -- <in.glb> <out.glb>

Every part gets a flat clay-like material (colours sampled from refs/outfits/01-hoodie-corduroy.png);
the head part additionally gets painted vertex colours: sclera, brown iris, pupil, highlights, blush, lips.
Eye / mouth positions are in Blender world coords of the raw Tripo export (height 0.980, feet at z=0),
measured from a front orthographic render (.tmp-tools/head-ortho.py).
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]

def srgb(c):
    c = np.array(c, float) / 255
    return tuple(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)) + (1.0,)

SKIN = (236, 182, 154)
PALETTE = {  # name: (sRGB, roughness, parts)
    "skin":    (SKIN,            0.55, [6, 35, 19, 27, 11, 13]),
    "hair":    ((30, 26, 26),    0.45, [0, 1, 12, 14, 15, 17, 32]),
    "brow":    ((48, 36, 32),    0.7,  [33, 34]),
    "glasses": ((20, 20, 20),    0.25, [23]),
    "hoodie":  ((150, 148, 150), 0.9,  [2]),
    "string":  ((182, 178, 176), 0.8,  [22, 30]),
    "jacket":  ((184, 141, 96),  0.85, [3, 8, 4, 5, 16, 21, 20, 25, 29, 36]),
    "pants":   ((66, 63, 68),    0.85, [7, 10, 26, 18]),
    "shoe":    ((238, 236, 232), 0.6,  [24, 9]),
    "lace":    ((226, 224, 220), 0.7,  [28, 31]),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = {o.name: o for o in bpy.context.scene.objects if o.type == "MESH"}

def material(name, rgb, rough, vcol=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(rgb)
    b.inputs["Roughness"].default_value = rough
    if vcol:
        n = m.node_tree.nodes.new("ShaderNodeVertexColor")
        n.layer_name = "Col"
        m.node_tree.links.new(n.outputs["Color"], b.inputs["Base Color"])
    return m

used = set()
for name, (rgb, rough, parts) in PALETTE.items():
    mat = material(name, rgb, rough)
    for p in parts:
        o = objs.get(f"tripo_part_{p}")
        if o is None:
            print("missing part", p); continue
        used.add(o.name)
        o.data.materials.clear()
        o.data.materials.append(mat)
left = sorted(set(objs) - used)
print("unassigned parts:", left)

# ---------- paint the face (head = part 6) ----------
head = objs["tripo_part_6"]
me = head.data
mw = np.array(head.matrix_world)
co = np.array([v.co[:] for v in me.vertices])
P = co @ mw[:3, :3].T + mw[:3, 3]
nr = np.array([v.normal[:] for v in me.vertices]) @ mw[:3, :3].T
X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
front = nr[:, 1] < -0.2          # Blender front = -Y

col = np.tile(np.array(srgb(SKIN)), (len(P), 1))

def mix(mask_w, rgb):
    global col
    w = np.clip(mask_w, 0, 1)[:, None]
    col = col * (1 - w) + np.array(srgb(rgb))[None, :] * w

def smooth_disc(cx, cz, rx, rz, soft=0.08):
    d = np.sqrt(((X - cx) / rx) ** 2 + ((Z - cz) / rz) ** 2)
    return np.clip((1 - d) / soft, 0, 1)

EYE_Z = float(argv[argv.index("--eye-z") + 1]) if "--eye-z" in argv else 0.7813
EYES = [(-0.0489, -0.0563), (0.0494, 0.0563)]   # (iris centre x, sclera centre x)
IR = 0.0150                                      # iris radius (the raised disc on the eyeball)
IRIS_SCALE = float(argv[argv.index("--iris") + 1]) if "--iris" in argv else 1.22
for ix, sx in EYES:
    sclera = smooth_disc(sx, EYE_Z - 0.0006, 0.0236, 0.0162, 0.06) * front
    mix(sclera, (250, 248, 245))
    # the design's iris fills most of the eye height: paint it larger than the sculpted disc
    IZ = EYE_Z - 0.0015
    iris = smooth_disc(ix, IZ, IR * IRIS_SCALE, IR * IRIS_SCALE, 0.06) * sclera   # clipped to the eye opening
    # iris: dark rim -> warm brown centre band, like the design
    d = np.sqrt((X - ix) ** 2 + (Z - IZ) ** 2) / (IR * IRIS_SCALE)
    ring = np.clip((d - 0.55) / 0.4, 0, 1)
    iris_rgb = np.array(srgb((92, 52, 32)))[None, :3] * (1 - ring[:, None]) + np.array(srgb((40, 22, 14)))[None, :3] * ring[:, None]
    w = iris[:, None]
    col[:, :3] = col[:, :3] * (1 - w) + iris_rgb * w
    R = IR * IRIS_SCALE
    mix(smooth_disc(ix, IZ, R * 0.5, R * 0.5, 0.12) * front, (12, 8, 6))           # pupil
    hx = ix + 0.30 * R   # highlight upper-right on both eyes, as in the design (one light source)
    mix(smooth_disc(hx, IZ + 0.33 * R, R * 0.2, R * 0.2, 0.25) * front, (255, 255, 255))  # main highlight
    mix(smooth_disc(ix - 0.35 * R, IZ - 0.38 * R, R * 0.09, R * 0.09, 0.4) * front, (255, 255, 255))  # small one

# cheeks (soft blush) and lips
for cx in (-0.075, 0.075):
    mix(0.35 * smooth_disc(cx, 0.728, 0.026, 0.017, 1.0) * front, (240, 150, 130))
MOUTH_Z = float(argv[argv.index("--mouth-z") + 1]) if "--mouth-z" in argv else 0.703
mix(0.55 * smooth_disc(0.0, MOUTH_Z, 0.030, 0.0065, 0.7) * front, (205, 112, 98))

attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
attr.data.foreach_set("color", col.astype(np.float32).ravel())
me.color_attributes.active_color = attr
head.data.materials.clear()
head.data.materials.append(material("face", SKIN, 0.55, vcol=True))

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_vertex_color="MATERIAL",
                          export_yup=True, export_apply=False)
print("exported", dst)
