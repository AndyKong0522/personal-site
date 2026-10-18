"""Rig a static TRELLIS GLB with the v3 28-bone skeleton (same bone names as the live site).

blender --background --python tools/blender-rig.py -- <mesh.glb> <rig-src.glb> <out.glb>
        [--tex fixed.png] [--faces 70000] [--arm-angle 28] [--no-decimate]

Steps: clean + decimate -> scale to 1.862 m, feet on the floor -> re-fit every joint to the
mesh's own anatomy -> automatic (heat) weights -> lower the arms to --arm-angle degrees from
vertical and apply that as the rest pose -> smooth / limit weights -> export GLB.
Blender axes: X = character left, Y = back (front is -Y), Z = up.
"""
import math, sys
import bpy, bmesh, numpy as np
from mathutils import Vector, Matrix, kdtree

argv = sys.argv[sys.argv.index("--") + 1:]
mesh_path, rig_path, out_path = argv[:3]
def opt(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
TEX = opt("--tex", None)
FACES = int(opt("--faces", 70000))
ARM_ANGLE = math.radians(float(opt("--arm-angle", 28)))
HEIGHT = 1.862

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def only_select(*objs):
    for o in scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

# ---------- skeleton from v3 ----------
bpy.ops.import_scene.gltf(filepath=rig_path)
arm = next(o for o in scene.objects if o.type == "ARMATURE")
for o in [o for o in scene.objects if o is not arm]:
    bpy.data.objects.remove(o, do_unlink=True)
arm.animation_data_clear()
for pb in arm.pose.bones:  # the importer can leave a non-rest pose on the bones
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()

# ---------- mesh ----------
before = set(scene.objects)
bpy.ops.import_scene.gltf(filepath=mesh_path)
new = [o for o in scene.objects if o not in before]
obj = next(o for o in new if o.type == "MESH")
mw = obj.matrix_world.copy()
obj.parent = None
obj.matrix_world = mw
for o in new:
    if o is not obj:
        bpy.data.objects.remove(o, do_unlink=True)
only_select(obj)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
obj.name = obj.data.name = "Avatar"

if TEX:
    img = bpy.data.images.load(TEX)
    img.pack()
    for m in obj.data.materials:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs[0].links):
                old = n.image
                n.image = img
                img.name = old.name
    print("texture replaced")

# clean: merge seam duplicates, drop loose bits
bm = bmesh.new()
bm.from_mesh(obj.data)
n0 = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
bm.to_mesh(obj.data)
bm.free()
print(f"merged {n0 - len(obj.data.vertices)} verts")
# imported custom normals go stale after merging/deforming -> dark streaks; use plain smooth normals
only_select(obj)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.customdata_custom_splitnormals_clear()
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.shade_smooth()

if "--no-decimate" not in argv and len(obj.data.polygons) > FACES:
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.ratio = FACES / len(obj.data.polygons)
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
print("faces", len(obj.data.polygons), "verts", len(obj.data.vertices))

# scale to the v3 height, feet on the floor, centred on X
V = np.array([v.co[:] for v in obj.data.vertices])
s = HEIGHT / (V[:, 2].max() - V[:, 2].min())
off = Vector((-(V[:, 0].max() + V[:, 0].min()) / 2, 0, -V[:, 2].min()))
obj.data.transform(Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation(off))
obj.data.update()
V = np.array([v.co[:] for v in obj.data.vertices])

# ---------- fit joints to this body ----------
def slice_c(z, xlo, xhi, half=0.012):
    m = (np.abs(V[:, 2] - z) < half) & (V[:, 0] > xlo) & (V[:, 0] < xhi)
    if m.sum() < 5:
        raise RuntimeError(f"empty slice z={z} x=({xlo},{xhi})")
    return V[m, 0].mean(), V[m, 1].mean()

def zprofile_mid(z):
    return ((np.abs(V[:, 2] - z) < 0.01) & (np.abs(V[:, 0]) < 0.012)).sum()

top = V[:, 2].max()
# crotch = highest z (scanning up from the knees) where nothing sits between the legs
crotch = next(z for z in np.arange(0.4, 1.2, 0.005) if zprofile_mid(z) > 20)
# chin = narrowest slice between collar and head
zs = np.arange(1.30, 1.60, 0.005)
widths = [np.ptp(V[np.abs(V[:, 2] - z) < 0.006, 0]) if (np.abs(V[:, 2] - z) < 0.006).any() else 9 for z in zs]
neck_z = zs[int(np.argmin(widths))]
print(f"crotch {crotch:.3f} neck {neck_z:.3f} top {top:.3f}")

J = {}
hip = crotch + 0.09
def torso(name, z, half_w=0.14):
    x, y = slice_c(z, -half_w, half_w)
    J[name] = Vector((0.0, y, z))
torso("Hips", hip + 0.03)
torso("Spine", hip + 0.13)
torso("Spine1", hip + 0.25)
torso("Spine2", hip + 0.37)
torso("Neck", neck_z - 0.045, 0.07)
torso("Head", neck_z + 0.035, 0.07)
J["Head_end"] = Vector((0.0, J["Head"].y, top))
J["root"] = Vector((0.0, J["Hips"].y, 0.0))

# shoulders: clavicle from near the neck to the shoulder joint
shoulder_z = J["Spine2"].z + 0.085
for side, sg in (("Left", 1), ("Right", -1)):
    J[f"{side}Shoulder"] = Vector((sg * 0.045, J["Spine2"].y, shoulder_z + 0.02))
    # shoulder joint: centre of the arm where it leaves the torso
    J[f"{side}Arm"] = Vector((sg * 0.175, J["Spine2"].y, shoulder_z - 0.035))

    # arm chain along the arm to the fingertip
    side_m = V[:, 0] * sg > 0
    tip_i = np.argmax(V[:, 0] * sg)
    tip = Vector(V[tip_i])
    a0 = J[f"{side}Arm"]
    d = (tip - a0).normalized()
    L = (tip - a0).length
    def along(t):
        p = a0 + d * (t * L)
        rel = V - np.array(p[:])
        proj = rel @ np.array(d[:])
        m = side_m & (np.abs(proj) < 0.012) & (np.linalg.norm(rel - np.outer(proj, d[:]), axis=1) < 0.09)
        return Vector(V[m].mean(0)) if m.sum() > 5 else p
    hand_len = 0.13
    wrist_t = 1 - hand_len / L
    J[f"{side}Arm"].y = along(0.12).y  # sit in the middle of the sleeve, front-to-back
    J[f"{side}ForeArm"] = along(wrist_t * 0.5)
    J[f"{side}Hand"] = along(wrist_t)
    J[f"{side}Hand_end"] = tip.copy()

    # legs
    x, y = slice_c(hip - 0.05, sg * 0.0 if sg > 0 else -0.25, 0.25 if sg > 0 else 0.0)
    J[f"{side}UpLeg"] = Vector((x, y, hip - 0.05))
    ankle = 0.15
    knee = (J[f"{side}UpLeg"].z + ankle) / 2 + 0.01
    x, y = slice_c(knee, 0.0 if sg > 0 else -0.25, 0.25 if sg > 0 else 0.0)
    J[f"{side}Leg"] = Vector((x, y - 0.01, knee))
    x, y = slice_c(ankle, 0.0 if sg > 0 else -0.3, 0.3 if sg > 0 else 0.0)
    J[f"{side}Foot"] = Vector((x, y, ankle))
    foot_m = side_m & (V[:, 2] < 0.06)
    front_y = V[foot_m, 1].min()
    J[f"{side}ToeBase"] = Vector((x, (y + front_y) / 2 - 0.02, 0.04))
    J[f"{side}ToeBase_end"] = Vector((x, front_y, 0.03))

for k in sorted(J):
    print(f"  joint {k:16s} {tuple(round(c, 3) for c in J[k])}")

# ---------- write joints into the armature ----------
CHILD = {"root": "Hips", "Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck",
         "Neck": "Head", "Head": "Head_end"}
for sd in ("Left", "Right"):
    CHILD.update({f"{sd}Shoulder": f"{sd}Arm", f"{sd}Arm": f"{sd}ForeArm", f"{sd}ForeArm": f"{sd}Hand",
                  f"{sd}Hand": f"{sd}Hand_end", f"{sd}UpLeg": f"{sd}Leg", f"{sd}Leg": f"{sd}Foot",
                  f"{sd}Foot": f"{sd}ToeBase", f"{sd}ToeBase": f"{sd}ToeBase_end"})
inv = arm.matrix_world.inverted()
only_select(arm)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
assert set(J) == {b.name for b in eb}, set(J) ^ {b.name for b in eb}
for b in eb:
    b.use_connect = False
for b in eb:
    b.head = inv @ J[b.name]
for b in eb:
    if b.name in CHILD:
        b.tail = inv @ J[CHILD[b.name]]
    else:  # *_end leaf: continue the parent's direction
        p = b.parent
        dvec = (J[b.name] - J[p.name]).normalized()
        b.tail = inv @ (J[b.name] + dvec * 0.03)
    if (b.tail - b.head).length < 1e-4:
        b.tail = b.head + Vector((0, 0, 1))
    b.roll = 0
bpy.ops.object.mode_set(mode="OBJECT")

# ---------- weights ----------
obj.vertex_groups.clear()
only_select(obj, arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

# fill vertices that heat weighting missed from their nearest weighted neighbour
me = obj.data
weighted = [v.index for v in me.vertices if sum(g.weight for g in v.groups) > 1e-4]
missing = [v.index for v in me.vertices if sum(g.weight for g in v.groups) <= 1e-4]
print(f"unweighted after heat: {len(missing)}")
if missing:
    kd = kdtree.KDTree(len(weighted))
    for i in weighted:
        kd.insert(me.vertices[i].co, i)
    kd.balance()
    for i in missing:
        _, j, _ = kd.find(me.vertices[i].co)
        for g in me.vertices[j].groups:
            obj.vertex_groups[g.group].add([i], g.weight, "REPLACE")

only_select(obj)
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.5, repeat=2)
bpy.ops.object.mode_set(mode="OBJECT")

# arm bones may only move the arm: strip arm weights from the jacket body / hem,
# otherwise lowering the arms tears the hem open
ARM_R = float(opt("--arm-radius", 0.17))
BODY_HALF = float(opt("--body-half", 0.215))   # jacket body half-width (arms are clear of it in the A-pose)
Z_LO = float(opt("--z-lo", 0.32))    # arm influence on the body is 0 below a.z - Z_LO ...
Z_HI = float(opt("--z-hi", 0.12))    # ... and full above a.z - Z_HI
X_BAND = float(opt("--x-band", 0.0)) # lateral fade band inside BODY_HALF (0 = off, old behaviour)
VW = np.array([v.co[:] for v in me.vertices])
stripped = 0

def poly_dist(P, pts):
    best = np.full(len(P), np.inf)
    for p0, p1 in zip(pts[:-1], pts[1:]):
        seg = p1 - p0
        tt = np.clip(((P - p0) @ seg) / (seg @ seg), 0, 1)
        best = np.minimum(best, np.linalg.norm(P - (p0 + np.outer(tt, seg)), axis=1))
    return best

for sd, sg in (("Left", 1), ("Right", -1)):
    chain = [np.array(J[f"{sd}{n}"][:]) for n in ("Arm", "ForeArm", "Hand", "Hand_end")]
    a = chain[0]
    dvec = (chain[-1] - a) / np.linalg.norm(chain[-1] - a)
    t = (VW - a) @ dvec
    dist = poly_dist(VW, chain)
    # jacket body below the armpit: fade arm influence out going down (hard cut tears the armpit
    # when the arm is raised; no cut lets the hem follow the hand)
    z = VW[:, 2]
    kz = np.clip((z - (a[2] - Z_LO)) / (Z_LO - Z_HI), 0, 1)
    kz = kz * kz * (3 - 2 * kz)
    # chest front/back panels (pockets) must not follow the arm: also fade by distance from the side seam
    if X_BAND > 0:
        kx = np.clip((np.abs(VW[:, 0]) - (BODY_HALF - X_BAND)) / X_BAND, 0, 1)
        kx = kx * kx * (3 - 2 * kx)
    else:
        kx = np.zeros(len(VW))
    fade = np.where(np.abs(VW[:, 0]) < BODY_HALF, 1 - (1 - kz) * (1 - kx), 1.0)
    bad = (dist > ARM_R) | (t < -0.06) | (VW[:, 0] * sg < 0) | (fade <= 0)
    for gname in (f"{sd}Arm", f"{sd}ForeArm", f"{sd}Hand"):
        g = obj.vertex_groups.get(gname)
        if g is None:
            continue
        for i in range(len(VW)):
            if fade[i] >= 1 and not bad[i]:
                continue
            try:
                w = g.weight(i)
            except RuntimeError:
                continue
            if bad[i]:
                g.remove([i])
                stripped += 1
            else:
                g.add([i], w * fade[i], "REPLACE")
print(f"stripped {stripped} stray arm weights")
weighted = [v.index for v in me.vertices if sum(g.weight for g in v.groups) > 1e-4]
missing = [v.index for v in me.vertices if sum(g.weight for g in v.groups) <= 1e-4]
if missing:
    kd = kdtree.KDTree(len(weighted))
    for i in weighted:
        kd.insert(me.vertices[i].co, i)
    kd.balance()
    for i in missing:
        _, j, _ = kd.find(me.vertices[i].co)
        for g in me.vertices[j].groups:
            obj.vertex_groups[g.group].add([i], g.weight, "REPLACE")
    print(f"refilled {len(missing)} vertices")

bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.5, repeat=1)  # soften the cut at the shoulder
# extra smoothing only around the armpits / shoulders, where raising the arm stretches the jacket
near = np.zeros(len(VW), bool)
for sd in ("Left", "Right"):
    near |= np.linalg.norm(VW - np.array(J[f"{sd}Arm"][:]), axis=1) < 0.17
bpy.ops.object.mode_set(mode="OBJECT")
me.vertices.foreach_set("select", near)
me.use_paint_mask_vertex = True
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.6, repeat=6)
bpy.ops.object.mode_set(mode="OBJECT")
me.use_paint_mask_vertex = False
me.vertices.foreach_set("select", np.ones(len(VW), bool))
# the shoulder smoothing leaks ForeArm/Hand weights onto the chest (the elbow is far outside the
# body), which shreds the chest pocket when the forearm swings in the wave: drop them again
body = np.where(np.abs(VW[:, 0]) < BODY_HALF)[0].tolist()
leaked = 0
for sd in ("Left", "Right"):
    for gname in (f"{sd}ForeArm", f"{sd}Hand", f"{sd}Hand_end"):
        g = obj.vertex_groups.get(gname)
        if g is None:
            continue
        for i in body:
            try:
                g.weight(i)
            except RuntimeError:
                continue
            g.remove([i])
            leaked += 1
print(f"removed {leaked} leaked forearm/hand weights on the body")
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
bpy.ops.object.mode_set(mode="OBJECT")

# ---------- lower the arms and make that the rest pose ----------
only_select(arm)
bpy.ops.object.mode_set(mode="POSE")
for sd, sg in (("Left", 1), ("Right", -1)):
    pb = arm.pose.bones[f"{sd}Arm"]
    head = arm.matrix_world @ pb.head
    tipw = arm.matrix_world @ arm.pose.bones[f"{sd}Hand"].head
    cur = (tipw - head).normalized()
    tgt = Vector((sg * math.sin(ARM_ANGLE), cur.y, -math.cos(ARM_ANGLE))).normalized()
    R = cur.rotation_difference(tgt).to_matrix().to_4x4()
    hl = pb.head.copy()  # armature space
    pb.matrix = Matrix.Translation(hl) @ R @ Matrix.Translation(-hl) @ pb.matrix
    bpy.context.view_layer.update()
    print(f"{sd} arm lowered {math.degrees(cur.angle(tgt)):.1f} deg")
bpy.ops.object.mode_set(mode="OBJECT")

only_select(obj)
mod = next(m for m in obj.modifiers if m.type == "ARMATURE")
bpy.ops.object.modifier_apply(modifier=mod.name)
only_select(arm)
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.select_all(action="SELECT")
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode="OBJECT")
mod = obj.modifiers.new("Armature", "ARMATURE")
mod.object = arm
obj.data.validate(clean_customdata=False)
for pb in arm.pose.bones:
    assert pb.matrix_basis == Matrix.Identity(4), pb.name

# ---------- export ----------
only_select(obj, arm)
bpy.ops.export_scene.gltf(
    filepath=out_path, export_format="GLB", use_selection=True,
    export_animations=False, export_skins=True, export_yup=True,
    export_apply=False,
)
print("exported", out_path)
