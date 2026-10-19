"""High-poly vertex-coloured mesh -> web mesh with baked textures. Two Blender passes around xatlas:

  blender -b --python tools/tripo-bake.py -- <high.glb> <low.npz> --export-low [--faces 150000]
  python tools/xatlas-uv.py <low.npz> <low-uv.npz> [--res 2048] [--head-scale 1.8]
  blender -b --python tools/tripo-bake.py -- <high.glb> <out.glb> --low-uv <low-uv.npz> [--tex 2048] [--ao 0.75]

pass 1: decimate a copy (collapse) to --faces, triangulate, dump V/F/part ids
pass 2: rebuild the low mesh with xatlas UVs (seam vertices merged back, UVs stay per-corner), then
        Cycles bakes high -> low (selected to active): base colour (vertex colours) + tangent normals;
        ambient occlusion on the low mesh itself; baseColor = colour * lerp(1, AO, --ao)
        (clay look: creases, hair strands, corduroy ribs darken); export GLB (PNG textures,
        compress later with gltf-transform). Keeps the "_part" attribute for rigging.
"""
import bpy, bmesh, sys, os
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
def opt(k, d):
    return type(d)(argv[argv.index(k) + 1]) if k in argv else d
FACES, TEX = opt("--faces", 150000), opt("--tex", 2048)
AO_K = opt("--ao", 0.75)
work = os.path.splitext(dst)[0] + "-bake"
if "--export-low" not in argv:
    os.makedirs(work, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
hi = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
hi.name = "high"
sc = bpy.context.scene

def only(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

def part_ids(me):
    pa = next(a for a in me.attributes if a.name.lower().lstrip("_") == "part")
    p = np.empty(len(me.vertices)); pa.data.foreach_get("value", p)
    return np.rint(p).astype(np.int32)

if "--export-low" in argv:
    only(hi)
    bpy.ops.object.duplicate()
    lo = bpy.context.view_layer.objects.active
    # the glTF round trip splits vertices along normal / colour seams: weld first, otherwise decimation
    # and xatlas see a mesh that is half open boundary and shatter it into tens of thousands of charts
    # weld *within* each part only: Tripo cut the parts out of one surface, so neighbouring parts share
    # vertex positions exactly; welding across them glues sleeve to jacket and the skinning then
    # stretches those faces into threads when the arm lifts
    pids = part_ids(lo.data)
    bm = bmesh.new(); bm.from_mesh(lo.data)
    n0 = len(bm.verts)
    bm.verts.ensure_lookup_table()
    groups = {}
    for v in bm.verts:
        groups.setdefault(int(pids[v.index]), []).append(v)
    for vs in groups.values():
        bmesh.ops.remove_doubles(bm, verts=vs, dist=1e-6)
    bm.to_mesh(lo.data); bm.free()
    print(f"welded {n0 - len(lo.data.vertices)} split verts")
    mod = lo.modifiers.new("dec", "DECIMATE")
    mod.ratio = min(1.0, FACES / len(hi.data.polygons))
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="dec")
    bm = bmesh.new(); bm.from_mesh(lo.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(lo.data); bm.free()
    me = lo.data
    V = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", V)
    F = np.empty(len(me.polygons) * 3, np.int64); me.polygons.foreach_get("vertices", F)
    np.savez(dst, V=V.reshape(-1, 3), F=F.reshape(-1, 3), PID=part_ids(me))
    print("low faces", len(me.polygons), "saved", dst)
    sys.exit(0)

# ---------- rebuild the low mesh from the xatlas result ----------
d = np.load(opt("--low-uv", ""))
me = bpy.data.meshes.new("low")
me.from_pydata(d["V"].tolist(), [], d["F"].tolist())
uvl = me.uv_layers.new(name="UVMap")
uvl.data.foreach_set("uv", d["UV"][d["F"].ravel()].ravel())
pa = me.attributes.new("_part", "FLOAT", "POINT")
pa.data.foreach_set("value", d["PID"].astype(np.float32))
lo = bpy.data.objects.new("low", me)
sc.collection.objects.link(lo)
bm = bmesh.new(); bm.from_mesh(me)
n0 = len(bm.verts)
# weld the UV seams back (same source vertex in xatlas' vmapping) so normals stay smooth across them;
# never by distance, which would also glue neighbouring parts together
bm.verts.ensure_lookup_table()
first = {}
targetmap = {}
for i, src_i in enumerate(d["VMAP"].tolist()):
    if src_i in first:
        targetmap[bm.verts[i]] = bm.verts[first[src_i]]
    else:
        first[src_i] = i
bmesh.ops.weld_verts(bm, targetmap=targetmap)
bm.to_mesh(me); bm.free()
for p in me.polygons:
    p.use_smooth = True
print(f"low mesh {len(me.polygons)} faces, welded {n0 - len(me.vertices)} seam verts")

# ---------- 3. bake ----------
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 16
mat = bpy.data.materials.new("avatar")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
me.materials.clear(); me.materials.append(mat)

def target(name, colorspace="sRGB"):
    img = bpy.data.images.new(name, TEX, TEX, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = img
    nt.nodes.active = n
    return img, n

bk = sc.render.bake
bk.margin = 8
bk.use_selected_to_active = True
bk.cage_extrusion = 0.004
bk.max_ray_distance = 0.02

def sel_to_active():
    bpy.ops.object.select_all(action="DESELECT")
    hi.select_set(True); lo.select_set(True)
    bpy.context.view_layer.objects.active = lo

col_img, col_node = target("color")
sel_to_active()
bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
bpy.ops.object.bake(type="DIFFUSE")
print("baked colour")

nrm_img, nrm_node = target("normal", "Non-Color")
sel_to_active()
bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
print("baked normal")

ao_img, ao_node = target("ao", "Non-Color")
hi.hide_render = True
only(lo)
bk.use_selected_to_active = False
sc.cycles.samples = 64
bpy.ops.object.bake(type="AO")
hi.hide_render = False
print("baked ao")

C = np.empty(TEX * TEX * 4, np.float32); col_img.pixels.foreach_get(C)
A = np.empty(TEX * TEX * 4, np.float32); ao_img.pixels.foreach_get(A)
C = C.reshape(-1, 4); A = A.reshape(-1, 4)
ao = A[:, 0:1]
# colour pixels are sRGB-encoded; darken in linear space
lin = np.where(C[:, :3] <= 0.04045, C[:, :3] / 12.92, ((C[:, :3] + 0.055) / 1.055) ** 2.4)
lin = lin * (1 - AO_K + AO_K * ao)
C[:, :3] = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)
col_img.pixels.foreach_set(C.ravel())
for img, name in ((col_img, "color.png"), (nrm_img, "normal.png"), (ao_img, "ao.png")):
    img.filepath_raw = os.path.join(work, name)
    img.file_format = "PNG"
    img.save()

# ---------- 4. material + export ----------
for n_ in (ao_node,):
    nt.nodes.remove(n_)
nt.links.new(col_node.outputs["Color"], bsdf.inputs["Base Color"])
nm = nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(nrm_node.outputs["Color"], nm.inputs["Color"])
nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
bsdf.inputs["Roughness"].default_value = 0.85
bpy.data.objects.remove(hi, do_unlink=True)
only(lo)
lo.name = "avatar"
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True,
                          export_image_format="AUTO", export_attributes=True)   # keeps "_part" for rigging
print("exported", dst)
