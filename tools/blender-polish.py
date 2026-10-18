"""Blender 精修：分析 → 清理 → 平滑蒙皮权重 → 导出 GLB

用法：
  blender --background --factory-startup --python tools/blender-polish.py -- <输入.glb> <输出.glb> [--analyze-only]

为什么这么做（前几版踩的坑）：
  · 生成器输出的网格常有重合顶点、孤立碎块、法线不统一 → 渲染出碎片/黑斑
  · 自动绑骨的肩部权重过渡太硬 → 抬手时腋下拉成丝
  这两类都能在本地免费修掉，不需要买商业重拓扑工具。
"""
import sys
import bmesh
import bpy


def argv_after_ddash():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)


def find_objects():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    return meshes, arms


def analyze(meshes, arms):
    print("=" * 60)
    for m in meshes:
        me = m.data
        print(f"[MESH] {m.name}  顶点 {len(me.vertices)}  面 {len(me.polygons)}  材质 {len(me.materials)}")
        print(f"       顶点组 {len(m.vertex_groups)}  修改器 {[mo.type for mo in m.modifiers]}")
        print(f"       UV 层 {[uv.name for uv in me.uv_layers]}")
        # 孤立碎块数量（连通分量）
        if len(me.vertices) < 200000:
            bm = bmesh.new()
            bm.from_mesh(me)
            bm.verts.ensure_lookup_table()
            seen = set()
            islands = 0
            for v in bm.verts:
                if v.index in seen:
                    continue
                islands += 1
                stack = [v]
                seen.add(v.index)
                while stack:
                    cur = stack.pop()
                    for e in cur.link_edges:
                        o = e.other_vert(cur)
                        if o.index not in seen:
                            seen.add(o.index)
                            stack.append(o)
            bm.free()
            print(f"       连通块 {islands}")
    for a in arms:
        print(f"[ARMATURE] {a.name}  骨骼 {len(a.data.bones)}")
        names = [b.name for b in a.data.bones]
        print("       " + ", ".join(names[:14]) + (" …" if len(names) > 14 else ""))
    print("=" * 60)


def remove_helpers(meshes):
    """删掉绑定服务残留的辅助物体。

    实测 hy-3d-rigging 的输出里带了一个半径 1 的 Icosphere（无材质、不属骨架、
    把模型下半身整个包住）。three.js 里因为没有材质看不到，但它确实占着节点和内存。
    """
    keep = []
    for m in meshes:
        is_helper = len(m.data.vertices) < 1000 and len(m.vertex_groups) == 0
        if is_helper:
            print(f"[清理] 删除辅助物体 {m.name}（顶点 {len(m.data.vertices)}，无蒙皮）")
            bpy.data.objects.remove(m, do_unlink=True)
        else:
            keep.append(m)
    return keep


def cleanup(meshes, do_merge=True, do_flip=True):
    for m in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        m.select_set(True)
        bpy.context.view_layer.objects.active = m

        before_v = len(m.data.vertices)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        if do_merge:
            # 合并重合顶点。阈值必须很小：合并跨 UV 接缝的顶点会让贴图涂抹
            bpy.ops.mesh.remove_doubles(threshold=0.0002)
        bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
        if do_flip:
            bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        after_v = len(m.data.vertices)
        print(f"[清理] {m.name}: 顶点 {before_v} → {after_v}（合并 {before_v - after_v}，merge={do_merge} flip={do_flip}）")


def smooth_weights(meshes, factor=0.5, repeat=3):
    """平滑所有顶点组的权重。

    自动绑骨在肩/髋这种大关节处的权重过渡很硬，抬臂就会把腋下拉成丝。
    均匀平滑几遍能显著减轻，但次数过多会让手指、脚趾这类小部位变肉，所以参数保守。
    """
    for m in meshes:
        if not m.vertex_groups:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        m.select_set(True)
        bpy.context.view_layer.objects.active = m
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        try:
            bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=factor, repeat=repeat)
            print(f"[权重] {m.name}: 平滑完成 factor={factor} repeat={repeat}")
        except Exception as e:  # noqa: BLE001
            print(f"[权重] 平滑失败: {e}")
        # glTF 每个顶点最多 4 个骨骼影响，超出会被截断并可能变形
        try:
            bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
            print(f"[权重] {m.name}: 限制到 4 个影响")
        except Exception as e:  # noqa: BLE001
            print(f"[权重] 限制失败: {e}")
        bpy.ops.object.mode_set(mode="OBJECT")


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=False,
        export_skins=True,
        export_animations=False,
        export_texcoords=True,
        export_normals=True,
    )
    print(f"[导出] {path}")


def main():
    args = argv_after_ddash()
    if len(args) < 2:
        print("用法: -- <输入.glb> <输出.glb> [--analyze-only]")
        return 1
    src, dst = args[0], args[1]
    analyze_only = "--analyze-only" in args

    clear_scene()
    import_glb(src)
    meshes, arms = find_objects()
    analyze(meshes, arms)
    if analyze_only:
        return 0

    meshes = remove_helpers(meshes)
    cleanup(meshes, do_merge="--no-merge" not in args, do_flip="--no-flip" not in args)
    if "--no-weights" not in args:
        smooth_weights(meshes)
    export_glb(dst)
    return 0


sys.exit(main())
