"""UV-unwrap a decimated mesh with xatlas (Blender's smart project shatters noisy decimated meshes into
tens of thousands of islands, and the per-island margins then eat the whole texture).

python tools/xatlas-uv.py <low.npz> <out.npz> [--res 2048] [--head-scale 1.8] [--head-z 0.66]

low.npz: V (n,3) float, F (m,3) int, PID (n,) int.  out.npz: V, F, UV (per new vertex), PID, VMAP.
Head + hair parts are scaled up before parametrisation, so they get more texels.
"""
import sys
import numpy as np
import xatlas

a = sys.argv[1:]
def opt(k, d):
    return type(d)(a[a.index(k) + 1]) if k in a else d
RES, HEAD_S, HEAD_Z = opt("--res", 2048), opt("--head-scale", 1.8), opt("--head-z", 0.66)
d = np.load(a[0])
V, F, PID = d["V"].astype(np.float32), d["F"].astype(np.uint32), d["PID"].astype(np.int32)
z0, z1 = V[:, 2].min(), V[:, 2].max()
Vs = V.copy()
head = set()
for p in np.unique(PID):
    m = PID == p
    if V[m, 2].mean() > z0 + HEAD_Z * (z1 - z0):
        head.add(int(p))
        c = V[m].mean(0)
        Vs[m] = c + (V[m] - c) * HEAD_S        # bigger in 3D -> bigger charts; shape unchanged
print(f"{len(V)} verts {len(F)} faces; head/hair parts scaled x{HEAD_S}: {len(head)}")

atlas = xatlas.Atlas()
atlas.add_mesh(Vs, F)
co = xatlas.ChartOptions()
# decimated meshes are noisy: let charts grow much bigger than the defaults (fewer seams, fewer
# speckles at chart borders, less mip bleeding)
co.max_iterations = opt("--iters", 4)
co.max_cost = opt("--max-cost", 12.0)
co.normal_deviation_weight = opt("--normal-weight", 1.0)
co.roundness_weight = 0.02
co.straightness_weight = 4.0
po = xatlas.PackOptions()
po.resolution = RES
po.padding = 4
po.bilinear = True
po.blockAlign = True
atlas.generate(co, po)
vmap, idx, uv = atlas[0]
print(f"charts {atlas.chart_count}, atlas {atlas.width}x{atlas.height}, utilization {atlas.utilization}")
np.savez(a[1], V=V[vmap], F=idx.astype(np.int32), UV=uv.astype(np.float32), PID=PID[vmap], VMAP=vmap)
print("saved", a[1], len(vmap), "verts")
