"""把某些 part 从另一个（更高面数的）网格里搬过来，用小网格出低模占位版本。

用途：眼球在 Tripo 这套模型里只有约 1000 个三角，整体减面到 4~5 万面时会被减面算法整个吃掉
（占位模型变成没有眼睛的假人），所以低模先减到目标面数，再把高模的眼球原样接回来。

用法：
  python tools/merge-parts.py <base.npz> <donor.npz> <out.npz> --parts 41,49
"""
import sys

import numpy as np

argv = sys.argv[1:]
paths = [a for a in argv if not a.startswith("--")]
base_p, donor_p, out_p = paths[0], paths[1], paths[2]
KEY = "--parts"
parts = set(
    int(x)
    for x in (argv[argv.index(KEY) + 1] if KEY in argv else "41,49").split(",")
    if x.strip()
)


def load(path):
    d = np.load(path)
    return d["V"].astype(np.float64), d["F"].astype(np.int64), d["PID"].astype(np.int32)


V0, F0, P0 = load(base_p)
V1, F1, P1 = load(donor_p)

# 1) 去掉基础网格里这些 part 的面（反正已经被减得面目全非）
keep = ~np.isin(P0[F0], list(parts)).any(axis=1)
F0 = F0[keep]

# 2) 压紧顶点：只保留还被面引用的
used = np.unique(F0)
remap = -np.ones(len(V0), dtype=np.int64)
remap[used] = np.arange(len(used))
V0, P0, F0 = V0[used], P0[used], remap[F0]

# 3) 从供体里取这些 part 的面（三顶点都属于这些 part）
sel = np.isin(P1[F1], list(parts)).all(axis=1)
Fe = F1[sel]
if len(Fe) == 0:
    raise SystemExit(f"donor has no faces for parts {sorted(parts)}")
ve = np.unique(Fe)
vremap = -np.ones(len(V1), dtype=np.int64)
vremap[ve] = np.arange(len(ve)) + len(V0)
Fe = vremap[Fe]

V = np.vstack([V0, V1[ve]])
P = np.concatenate([P0, P1[ve]])
F = np.vstack([F0, Fe])

np.savez(out_p, V=V, F=F, PID=P)
print(
    f"base {len(V0)}v/{len(F0)}f + donor eyes {len(ve)}v/{len(Fe)}f "
    f"-> {len(V)}v/{len(F)}f  saved {out_p}"
)
