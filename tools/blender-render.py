"""Render a GLB from several angles for visual review.

blender --background --python tools/blender-render.py -- <in.glb> <out-prefix> [--size 900] [--face]
Writes <out-prefix>-front.png, -34.png, -side.png, -back.png (and -face.png with --face).
"""
import math, sys
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, prefix = argv[0], argv[1]
size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 900
do_face = "--face" in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

if "--tex" in argv:  # swap the base-color texture for a preview
    new_img = bpy.data.images.load(argv[argv.index("--tex") + 1])
    for m in bpy.data.materials:
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs[0].links):
                    n.image = new_img

# the glTF importer adds a hidden "Icosphere" bone-shape helper for skinned files: skip tiny meshes
for o in [o for o in bpy.context.scene.objects if o.type == "MESH" and len(o.data.vertices) < 1000]:
    bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
center, dim = (lo + hi) / 2, hi - lo
H = dim.z
print(f"bbox {tuple(round(v, 3) for v in dim)}")

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = size
scene.render.resolution_y = int(size * 4 / 3)
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.92, 0.92, 0.92, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9

def light(name, rot, energy):
    d = bpy.data.lights.new(name, "SUN")
    d.energy = energy
    o = bpy.data.objects.new(name, d)
    o.rotation_euler = [math.radians(a) for a in rot]
    scene.collection.objects.link(o)

light("key", (50, 0, -30), 3.0)
light("fill", (60, 0, 140), 1.0)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 85
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

def shot(name, yaw_deg, target, height):
    fov = 2 * math.atan(cam_data.sensor_width / 2 / cam_data.lens)
    dist = height / (2 * math.tan(fov / 2)) * 1.0
    yaw = math.radians(yaw_deg)
    # glTF front (+Z) becomes Blender -Y
    cam.location = target + Vector((math.sin(yaw) * dist, -math.cos(yaw) * dist, 0))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{prefix}-{name}.png"
    bpy.ops.render.render(write_still=True)

for name, yaw in (("front", 0), ("34", 35), ("side", 90), ("back", 180)):
    shot(name, yaw, center, H * 1.08)
if do_face:
    shot("face", 0, Vector((center.x, center.y, hi.z - H * 0.1)), H * 0.24)
