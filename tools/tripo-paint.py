"""Paint an untextured, part-segmented Tripo export from its 2D design image -> one joined mesh with vertex colours.

blender -b --python tools/tripo-paint.py -- <in.glb> <design.png> <out.glb> [--debug <prefix>]

* every part's colour = median of the design pixels its front-visible vertices project onto
  (silhouette-bbox alignment; the median makes it robust to the design's slightly different proportions)
* parts nobody sees from the front borrow the colour of the nearest painted part
* eyes (separate eyeball parts) are painted procedurally on the geometry: sclera, iris, pupil, highlights
* face: soft blush + lip tint
The output keeps an integer attribute "part" (per vertex) for later steps.
"""
import bpy, bmesh, sys, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:]
src, design, dst = argv[0], argv[1], argv[2]
def opt(k, d=None):
    return argv[argv.index(k) + 1] if k in argv else d
CFG = json.loads(open(opt("--cfg")).read()) if opt("--cfg") else {}

def to_lin(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in parts:
    pid = int(o.name.rsplit("_", 1)[-1]) if o.name.rsplit("_", 1)[-1].isdigit() else -1
    a = o.data.attributes.new("part", "INT", "POINT")
    a.data.foreach_set("value", [pid] * len(o.data.vertices))
    o.data.materials.clear()
bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.name = "avatar"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data
n = len(me.vertices)
P = np.empty(n * 3); me.vertices.foreach_get("co", P); P = P.reshape(-1, 3)
N = np.empty(n * 3); me.vertices.foreach_get("normal", N); N = N.reshape(-1, 3)
PID = np.empty(n, dtype=np.int32); me.attributes["part"].data.foreach_get("value", PID)
print(f"joined {len(parts)} parts, {n} verts, {len(me.polygons)} faces")

# ---------- design image: figure bbox ----------
im = bpy.data.images.load(design)
w_, h_ = im.size
I = np.empty(w_ * h_ * 4, np.float32); im.pixels.foreach_get(I)
I = I.reshape(h_, w_, 4)[::-1, :, :3].copy()     # sRGB values, top row first
bg = I[5:40, 5:40].reshape(-1, 3).mean(0)
fg = np.abs(I - bg).sum(2) > 0.12
ys, xs = np.where(fg)
# ignore the soft floor shadow: the figure's lowest row is where the shoes end
rows = np.where(fg.sum(1) > 25)[0]
iy0, iy1 = rows.min(), rows.max()
cols = np.where(fg[iy0:iy1].sum(0) > 6)[0]
ix0, ix1 = cols.min(), cols.max()
print("design bbox px", ix0, ix1, iy0, iy1)
mx0, mx1, mz0, mz1 = P[:, 0].min(), P[:, 0].max(), P[:, 2].min(), P[:, 2].max()
def to_px(x, z):
    u = ix0 + (x - mx0) / (mx1 - mx0) * (ix1 - ix0)
    v = iy0 + (mz1 - z) / (mz1 - mz0) * (iy1 - iy0)
    return u, v

# ---------- front visibility ----------
bm = bmesh.new(); bm.from_mesh(me); bvh = BVHTree.FromBMesh(bm)
facing = N[:, 1] < -0.35
vis = np.zeros(n, bool)
for i in np.where(facing)[0]:
    p = Vector(P[i]) + Vector((0, -1e-4, 0))
    hit = bvh.ray_cast(p, Vector((0, -1, 0)))
    vis[i] = hit[0] is None
print(f"front-visible verts {vis.sum()} / {n}")

u, v = to_px(P[:, 0], P[:, 2])
ui = np.clip(u.astype(int), 0, I.shape[1] - 1); vi = np.clip(v.astype(int), 0, I.shape[0] - 1)
samp = I[vi, ui]
inside = fg[vi, ui]

colors = {}
cent = {}
for pid in np.unique(PID):
    m = PID == pid
    cent[pid] = P[m].mean(0)
    s = m & vis & inside
    if s.sum() >= 25:
        colors[pid] = np.median(samp[s], axis=0)   # sRGB 0..1
missing = [p for p in cent if p not in colors]
for pid in missing:
    best = min(colors, key=lambda q: np.linalg.norm(cent[q] - cent[pid]))
    colors[pid] = colors[best]
for k, v_ in CFG.get("override", {}).items():
    colors[int(k)] = np.array(v_, float) / 255
# explicit categories win over the sampled medians (the design's proportions differ from the model's,
# so projection alone mis-assigns small / edge parts); "*" = every part not listed elsewhere
cats = CFG.get("categories", {})
listed = {p for c in cats.values() for p in c.get("parts", [])}
for name, c in cats.items():
    ps = c.get("parts", [])
    if ps == "*":
        ps = [p for p in colors if p not in listed]
    for p in ps:
        colors[int(p)] = np.array(c["rgb"], float) / 255
print("borrowed colour:", missing)
for pid in sorted(colors):
    c = (colors[pid] * 255).astype(int)
    print(f"PART {pid:3d} z={cent[pid][2]:.2f} x={cent[pid][0]:+.2f} rgb={tuple(c)}")

col = np.zeros((n, 4)); col[:, 3] = 1
for pid, c in colors.items():
    col[PID == pid, :3] = to_lin(c)

X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
def disc(cx, cz, rx, rz, soft):
    d = np.sqrt(((X - cx) / rx) ** 2 + ((Z - cz) / rz) ** 2)
    return np.clip((1 - d) / soft, 0, 1)
def mix(w, rgb):
    w = np.clip(w, 0, 1)[:, None]
    col[:, :3] = col[:, :3] * (1 - w) + to_lin(np.array(rgb) / 255)[None, :] * w

# ---------- eyes ----------
for e in CFG.get("eyes", []):
    m = (PID == e["part"]).astype(float)
    ix, iz, r = e["iris"]
    # the sculpted eyeball is much bigger than the design's eye opening: paint an almond opening around
    # the iris (sclera) and turn the rest of the eyeball into eyelid skin, a touch darker than the face
    skin = np.array(CFG["categories"]["skin"]["rgb"]) * 0.9
    mix(m, tuple(skin))
    ew, eh = e.get("open", [1.9, 1.12])
    almond = disc(ix + e.get("open_dx", 0.0), iz, r * ew, r * eh, 0.12)
    mix(m * almond, (242, 238, 232))                           # sclera (warm off-white, as in the design)
    lid = np.clip(1 - np.abs(np.sqrt(((X - ix - e.get("open_dx", 0.0)) / (r * ew)) ** 2 + ((Z - iz) / (r * eh)) ** 2) - 1.0) / 0.08, 0, 1)
    mix(m * lid * (Z > iz).astype(float), (45, 30, 26))         # dark upper lid line
    m = m * almond                                             # iris / pupil / highlights stay inside the opening
    dd = np.sqrt((X - ix) ** 2 + (Z - iz) ** 2) / r
    ring = np.clip((dd - 0.55) / 0.4, 0, 1)[:, None]
    irgb = to_lin(np.array((96, 56, 34)) / 255) * (1 - ring) + to_lin(np.array((38, 22, 14)) / 255) * ring
    w = (m * disc(ix, iz, r, r, 0.06))[:, None]
    col[:, :3] = col[:, :3] * (1 - w) + irgb * w
    mix(m * disc(ix, iz, r * 0.5, r * 0.5, 0.12), (12, 8, 6))
    mix(m * disc(ix + 0.3 * r, iz + 0.33 * r, r * 0.2, r * 0.2, 0.25), (255, 255, 255))
    mix(m * disc(ix - 0.35 * r, iz - 0.38 * r, r * 0.09, r * 0.09, 0.4), (255, 255, 255))

# ---------- face: blush + lips ----------
face = CFG.get("face")
if face:
    fm = (PID == face["part"]) & (N[:, 1] < -0.2)
    for cx, cz in face.get("cheeks", []):
        mix(fm * 0.35 * disc(cx, cz, 0.024, 0.016, 1.0), (240, 150, 130))
    if "mouth" in face:
        mx_, mz_, hw = face["mouth"]
        mix(fm * 0.5 * disc(mx_, mz_, hw, 0.0065, 0.7), (205, 112, 98))

# glTF only round-trips custom attributes that start with "_" (and as floats)
pf = me.attributes.new("_part", "FLOAT", "POINT")
pf.data.foreach_set("value", PID.astype(np.float32))
a = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
a.data.foreach_set("color", col.astype(np.float32).ravel())
me.color_attributes.active_color = a
mat = bpy.data.materials.new("paint"); mat.use_nodes = True
vc = mat.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
b = mat.node_tree.nodes["Principled BSDF"]
mat.node_tree.links.new(vc.outputs["Color"], b.inputs["Base Color"])
b.inputs["Roughness"].default_value = 0.85
me.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_vertex_color="MATERIAL",
                          export_attributes=True)
print("exported", dst)
