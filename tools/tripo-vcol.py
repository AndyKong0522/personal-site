"""Paint the low-poly Tripo mesh with **vertex colours** (+ optional vertex AO) instead of a baked colour map.

blender -b --python tools/tripo-vcol.py -- <low-uv.npz> <out.glb> [--cfg tools/tripo-n2.json]
        [--normal <normal.png>] [--ao 0.5] [--ao-dist 0.05] [--tex 2048]

Why not a colour texture: the low mesh needs ~5000 UV charts (corduroy comb + hair strands), so a 2048²
atlas gives each chart only ~12 texels. The colour bake then sits in a 8 px margin between charts, the
margins bleed into each other under mipmapping and every garment seam turns into a grey fringe — the
"dirty / cheap" look. The colour itself is flat per part anyway, so nothing is lost by keeping it
per vertex: exact values, no seams, no mipmaps, ~1 MB less to download.

The normal map is kept (bump detail survives a coarse atlas — it is low frequency) and so is the skinning
data ("_part" is written for tools/blender-rig.py). One material per category so roughness can differ per
material (skin vs cloth vs glasses) without any texture.
"""
import bpy, bmesh, sys, json, os
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]


def opt(k, d=None):
    return argv[argv.index(k) + 1] if k in argv else d


CFG = json.loads(open(opt("--cfg")).read()) if opt("--cfg") else {}
NORMAL_PNG = opt("--normal")
NORMAL_PNG = os.path.abspath(NORMAL_PNG) if NORMAL_PNG else None
AO_K = float(opt("--ao", 0.0))
AO_DIST = float(opt("--ao-dist", 0.05))
AO_FLOOR = float(opt("--ao-floor", 0.45))
TEX = int(opt("--tex", 2048))


def to_lin(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- build the low mesh from the xatlas result ----------
d = np.load(src)
me = bpy.data.meshes.new("low")
me.from_pydata(d["V"].tolist(), [], d["F"].tolist())
uvl = me.uv_layers.new(name="UVMap")
uvl.data.foreach_set("uv", d["UV"][d["F"].ravel()].ravel())
obj = bpy.data.objects.new("avatar", me)
bpy.context.scene.collection.objects.link(obj)
bm = bmesh.new()
bm.from_mesh(me)
n0 = len(bm.verts)
# weld the UV seams back (same source vertex in xatlas' vmapping) so the surface is smooth across them
bm.verts.ensure_lookup_table()
first, targetmap = {}, {}
for i, src_i in enumerate(d["VMAP"].tolist()):
    if src_i in first:
        targetmap[bm.verts[i]] = bm.verts[first[src_i]]
    else:
        first[src_i] = i
bmesh.ops.weld_verts(bm, targetmap=targetmap)
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
n = len(me.vertices)
print(f"low mesh {len(me.polygons)} faces, {n} verts (welded {n0 - n} uv-seam verts)")

# Part id per surviving vertex. weld_verts keeps only the first occurrence of every source vertex and
# to_mesh preserves index order, so the k-th surviving vertex is the k-th smallest `first` index.
PID_SPLIT = np.asarray(d["PID"], np.int32)
surv = sorted(first.values())
assert len(surv) == n, (len(surv), n)
PID = PID_SPLIT[np.asarray(surv, np.int32)]

# ---------- optional densify of the eyeballs ----------
# Off by default (--eye-cut 0). Vertex colours cannot draw a crisp iris at this density, and raising the
# eyeball density makes Blender's heat weighting fail for the whole mesh ("failed to find solution"),
# so the eye is drawn analytically in the shader instead: src/three/eyeShading.ts.
EYE_CUT = int(opt("--eye-cut", 0))
EYE_PARTS = {int(e["part"]) for e in CFG.get("eyes", [])} if EYE_CUT else set()
if EYE_PARTS:
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    lay = bm.verts.layers.float.new("pid")
    for v in bm.verts:
        v[lay] = float(PID[v.index])
    edges = [e for e in bm.edges if all(int(round(v[lay])) in EYE_PARTS for v in e.verts)]
    # smooth=0 keeps the new vertices exactly on the old surface: the sculpted eyeball already has the
    # right shape and only needs a finer grid for the iris. (smooth=1 bulges the poles and makes heat
    # weighting singular, which then leaves the whole mesh unweighted.)
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=EYE_CUT, smooth=0.0, use_grid_fill=True)
    # only inside the eyeballs: welding across parts would glue the sleeve to the jacket (see tripo-bake.py)
    eye_verts = [v for v in bm.verts if int(round(v[lay])) in EYE_PARTS]
    bmesh.ops.remove_doubles(bm, verts=eye_verts, dist=1e-7)
    for p in bm.faces:
        p.smooth = True
    bm.to_mesh(me)
    PID = np.rint(np.array([v[lay] for v in bm.verts], np.float32)).astype(np.int32)
    bm.free()
    n = len(me.vertices)
    print(f"eyeballs subdivided: {len(me.polygons)} faces, {n} verts")
print("parts present:", len(np.unique(PID)))

P = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get("co", P)
P = P.reshape(-1, 3)
N = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get("normal", N)
N = N.reshape(-1, 3)
n = len(me.vertices)

# ---------- thin the glasses frame ----------
# 框是一个管状结构：一环邻域的平均点就在管的轴线上，所以一次 Laplacian 收缩就等于把截面往轴心收，
# 镜片开口的位置不动。normal map 是旧几何烘的，但镜框是亮面黑塑料，那点误差看不出来。
THIN = CFG.get("thin")
if THIN:
    sel = np.isin(PID, np.array(THIN["parts"], np.int32))
    F0 = np.empty(len(me.polygons) * 3, np.int64)
    me.polygons.foreach_get("vertices", F0)
    F0 = F0.reshape(-1, 3)
    for _ in range(int(THIN.get("iterations", 1))):
        acc = np.zeros_like(P)
        cnt = np.zeros(len(P))
        for a_, b_ in ((0, 1), (1, 2), (2, 0)):
            np.add.at(acc, F0[:, a_], P[F0[:, b_]])
            np.add.at(cnt, F0[:, a_], 1)
            np.add.at(acc, F0[:, b_], P[F0[:, a_]])
            np.add.at(cnt, F0[:, b_], 1)
        mean_nb = acc / np.maximum(cnt, 1)[:, None]
        P[sel] += float(THIN["strength"]) * (mean_nb[sel] - P[sel])
    me.vertices.foreach_set("co", P.astype(np.float32).ravel())
    me.update()
    me.vertices.foreach_get("co", P.ravel())
    me.vertices.foreach_get("normal", N.ravel())
    print(f"thinned glasses: {int(sel.sum())} verts, strength {THIN['strength']}")

# ---------- colours ----------
cats = CFG.get("categories", {})
colors = {}
listed = {p for c in cats.values() if isinstance(c.get("parts"), list) for p in c["parts"]}
for name, c in cats.items():
    ps = c.get("parts", [])
    if ps == "*":
        ps = [p for p in np.unique(PID) if int(p) not in listed]
    for p in ps:
        colors[int(p)] = np.array(c["rgb"], float) / 255
for k, v_ in CFG.get("override", {}).items():
    colors[int(k)] = np.array(v_, float) / 255

col = np.zeros((n, 4))
col[:, 3] = 1
missing = [int(p) for p in np.unique(PID) if int(p) not in colors]
if missing:
    raise SystemExit(f"no colour for parts {missing}: add them to the config")
for pid in np.unique(PID):
    m = PID == pid
    col[m, :3] = to_lin(colors[int(pid)])

X, Y, Z = P[:, 0], P[:, 1], P[:, 2]


def disc(cx, cz, rx, rz, soft):
    dd = np.sqrt(((X - cx) / rx) ** 2 + ((Z - cz) / rz) ** 2)
    return np.clip((1 - dd) / soft, 0, 1)


def mix(w, rgb):
    w = np.clip(w, 0, 1)[:, None]
    col[:, :3] = col[:, :3] * (1 - w) + to_lin(np.array(rgb) / 255)[None, :] * w


# ---------- eyes ----------
for e in CFG.get("eyes", []):
    m = (PID == e["part"]).astype(float)
    ix, iz, r = e["iris"]
    skin = np.array(CFG["categories"]["skin"]["rgb"]) * 0.9
    mix(m, tuple(skin))
    ew, eh = e.get("open", [1.9, 1.12])
    dx = e.get("open_dx", 0.0)
    almond = disc(ix + dx, iz, r * ew, r * eh, 0.12)
    mix(m * almond, (242, 238, 232))
    lid = np.clip(
        1 - np.abs(np.sqrt(((X - ix - dx) / (r * ew)) ** 2 + ((Z - iz) / (r * eh)) ** 2) - 1.0) / 0.08, 0, 1
    )
    mix(m * lid * (Z > iz).astype(float), (45, 30, 26))
    m = m * almond
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
        mix(fm * 0.45 * disc(cx, cz, 0.024, 0.016, 1.0), (240, 150, 130))
    if "mouth" in face:
        mx_, mz_, hw = face["mouth"]
        # 嘴角上扬的弧线：抛物线 z = mz + k·(x-mx)²，k 越大笑得越开
        k = float(face.get("smile", 0.0))
        zc = mz_ + k * (X - mx_) ** 2
        t = np.clip((X - mx_) / hw, -1, 1)
        ends = np.sqrt(np.clip(1 - t * t, 0, 1))          # 两端渐隐
        mix(fm * np.exp(-((Z - zc) / 0.0032) ** 2) * ends * 0.8, (186, 94, 82))
        mix(fm * np.exp(-((Z - zc + 0.006) / 0.0038) ** 2) * ends * 0.2, (250, 206, 190))

# ---------- optional vertex AO (Cycles bakes one sample per vertex: no atlas, no gutters) ----------
if AO_K > 0:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24
    sc.world = sc.world or bpy.data.worlds.new("W")
    sc.world.light_settings.distance = AO_DIST
    ao_attr = me.color_attributes.new("AOtmp", "FLOAT_COLOR", "POINT")
    me.color_attributes.active_color = ao_attr
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    sc.render.bake.target = "VERTEX_COLORS"
    sc.render.bake.use_selected_to_active = False
    bpy.ops.object.bake(type="AO")
    A = np.empty(n * 4, np.float32)
    ao_attr.data.foreach_get("color", A)
    ao = np.clip(A.reshape(-1, 4)[:, :3].mean(1), 0, 1)
    print(f"vertex ao: min {ao.min():.3f} mean {ao.mean():.3f} max {ao.max():.3f}")
    # AO never fully blacks out: the creases darken, the broad surfaces stay clean (a fully multiplied
    # AO reads as dirt rather than as shading)
    ao = AO_FLOOR + (1 - AO_FLOOR) * ao
    k = 1 - AO_K + AO_K * ao
    col[:, :3] *= k[:, None]
    me.color_attributes.remove(ao_attr)

# ---------- curvature (cavity) shading ----------
# The 150k mesh still has most of the grooves (hair strands, corduroy ribs) but a flat vertex colour hides
# them: darken the concave vertices and lift the convex ones and every strand reads as its own ridge,
# without touching the geometry.
CAVITY = CFG.get("cavity", {})
if CAVITY:
    F = np.empty(len(me.polygons) * 3, np.int64)
    me.polygons.foreach_get("vertices", F)
    F = F.reshape(-1, 3)
    acc = np.zeros_like(P)
    cnt = np.zeros(len(P))
    for a_, b_ in ((0, 1), (1, 2), (2, 0)):
        np.add.at(acc, F[:, a_], P[F[:, b_]])
        np.add.at(cnt, F[:, a_], 1)
        np.add.at(acc, F[:, b_], P[F[:, a_]])
        np.add.at(cnt, F[:, b_], 1)
    lap = acc / np.maximum(cnt, 1)[:, None] - P
    ln = np.linalg.norm(lap, axis=1)
    cav = np.where(ln > 1e-12, (lap * N).sum(1) / np.maximum(ln, 1e-12), 0.0)
    # per-category z-score: only how a vertex compares with its own part matters, not the absolute value
    wt = np.zeros(len(P))
    z = np.zeros(len(P))
    for name, c in cats.items():
        ps = c.get("parts", [])
        if ps == "*":
            ps = [p for p in np.unique(PID) if int(p) not in listed]
        m = np.isin(PID, np.array([int(p) for p in ps], np.int32))
        if not m.any():
            continue
        s = cav[m]
        z[m] = np.clip((s - np.median(s)) / (s.std() + 1e-6), -2.5, 2.5)
        wt[m] = float(CAVITY.get(name, CAVITY.get("default", 0.0)))
    occl = wt * 0.24 * np.clip(z, 0, 2.5)      # 凹进去的地方压暗
    ridge = wt * 0.14 * np.clip(-z, 0, 2.5)    # 凸起来的棱提亮（发丝的高光就靠它）
    col[:, :3] *= (1.0 - occl + ridge)[:, None]
    print(f"cavity: max darken {occl.max():.2f} max lift {ridge.max():.2f}")

# 眼球（part 41/49）顶点色写白：颜色全部由着色器画（src/three/avatarShading.ts），白色让眼球材质
# 和其他部分共用同一个着色器程序——程序少一份，首屏着色器编译就快一截。
EYE_IDS = [int(e["part"]) for e in CFG.get("eyes", [])]
if EYE_IDS:
    col[np.isin(PID, np.array(EYE_IDS, np.int32)), :3] = 1.0

# a little vertical gradient in the hair reads as volume even where the geometry is flat
col[:, 3] = 1
ca = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
ca.data.foreach_set("color", col.astype(np.float32).ravel())
me.color_attributes.active_color = ca

# ---------- one material per category: same vertex colours, different roughness ----------
def make_mat(name, rough, metal):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], b.inputs["Base Color"])
    if NORMAL_PNG:
        img = bpy.data.images.load(NORMAL_PNG, check_existing=True)
        img.colorspace_settings.name = "Non-Color"
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


part_mat = {}
for name, c in cats.items():
    ps = c.get("parts", [])
    if ps == "*":
        ps = [p for p in np.unique(PID) if int(p) not in listed]
    for p in ps:
        part_mat[int(p)] = c.get("mat", name)
MATS = CFG.get("materials", {})
mats = {}
me.materials.clear()
for name in sorted(set(part_mat.values())):   # 同类布料共用一个材质：少一个材质就少一次绘制
    m = MATS.get(name, {})
    me.materials.append(make_mat(name, float(m.get("rough", 0.9)), float(m.get("metal", 0.0))))
    mats[name] = len(me.materials) - 1
# per-polygon category = category of its first vertex
vcat = np.array([mats[part_mat[int(p)]] for p in PID], np.int32)
fp = np.empty(len(me.polygons) * 3, np.int64)
me.polygons.foreach_get("vertices", fp)
firstv = fp.reshape(-1, 3)[:, 0]
mi = np.empty(len(me.polygons), np.int32)
mi[:] = vcat[firstv]
me.polygons.foreach_set("material_index", mi)

pf = me.attributes.new("_part", "FLOAT", "POINT")
pf.data.foreach_set("value", PID.astype(np.float32))

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_vertex_color="MATERIAL",
    export_attributes=True,
    export_apply=False,
)
print("exported", dst, os.path.getsize(dst))
