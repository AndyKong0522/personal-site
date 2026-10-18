"""Bake per-texel object-space position + normal maps for a single-texture GLB.

blender --background --python tools/blender-texmaps.py -- <in.glb> <out-dir>
Writes <out-dir>/pos.npy, nrm.npy (H x W x 3 float32, NaN where no surface),
base.npy (H x W x 4 float32 base color) and base-orig.png.
Coordinates are glTF space: X = character left, Y = up, Z = toward camera.
"""
import os, sys
import bpy, numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mat = obj.data.materials[0]
base_img = next(n.image for n in mat.node_tree.nodes
                if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs[0].links))
W, H = base_img.size
base = np.array(base_img.pixels[:], dtype=np.float32).reshape(H, W, 4)
np.save(os.path.join(out, "base.npy"), base)
base_img.filepath_raw = os.path.join(out, "base-orig.png")
base_img.file_format = "PNG"
base_img.save()

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 1
scene.cycles.device = "CPU"
scene.render.bake.margin = 4
scene.render.bake.use_clear = False  # keep NaN where no surface

bake_mat = bpy.data.materials.new("bake")
bake_mat.use_nodes = True
nt = bake_mat.node_tree
nt.nodes.clear()
geo = nt.nodes.new("ShaderNodeNewGeometry")
emit = nt.nodes.new("ShaderNodeEmission")
outn = nt.nodes.new("ShaderNodeOutputMaterial")
tex = nt.nodes.new("ShaderNodeTexImage")
nt.links.new(emit.outputs[0], outn.inputs[0])
obj.data.materials.clear()
obj.data.materials.append(bake_mat)
for o in bpy.context.scene.objects:
    o.select_set(False)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

# object space == glTF space after the importer's Y-up -> Z-up conversion is undone below
def bake(socket, name):
    img = bpy.data.images.new(name, W, H, alpha=True, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    img.pixels[:] = np.full(W * H * 4, np.nan, dtype=np.float32)
    tex.image = img
    nt.nodes.active = tex
    for l in list(emit.inputs[0].links):
        nt.links.remove(l)
    nt.links.new(geo.outputs[socket], emit.inputs[0])
    bpy.ops.object.bake(type="EMIT")
    a = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    return a

pos = bake("Position", "pos")
nrm = bake("Normal", "nrm")
# baked-over texels have alpha 1; untouched keep NaN. Blender Z-up -> glTF Y-up: (x, y, z) -> (x, z, -y)
def to_gltf(a):
    v = a[..., :3]
    g = np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)
    g[~np.isfinite(a[..., 3]) | (a[..., 3] < 0.5)] = np.nan
    return g.astype(np.float32)
np.save(os.path.join(out, "pos.npy"), to_gltf(pos))
np.save(os.path.join(out, "nrm.npy"), to_gltf(nrm))
print("baked", W, H, "covered", int(np.isfinite(to_gltf(pos)[..., 0]).sum()))
