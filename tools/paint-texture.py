"""Repaint eyes + recolor jacket on a TRELLIS texture, using baked texel position maps.

python tools/paint-texture.py <maps-dir> <out.png>
<maps-dir> comes from tools/blender-texmaps.py (pos.npy, nrm.npy, base.npy; Blender row order = bottom-up).
Coordinates (glTF): X = character left (= viewer right), Y = up, Z = toward camera.
Model A is normalised to height 1.0 (y in -0.5..0.5).
"""
import sys
import numpy as np
from PIL import Image

d, out = sys.argv[1], sys.argv[2]
pos, nrm, base = np.load(d + "/pos.npy"), np.load(d + "/nrm.npy"), np.load(d + "/base.npy")
ok = np.isfinite(pos[..., 0])
X, Y, Z = (np.nan_to_num(pos[..., i], nan=-9) for i in range(3))
NZ = np.nan_to_num(nrm[..., 2], nan=-1)
rgb = base[..., :3].copy()  # sRGB values

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def mix(dst, col, w):
    w = w[..., None]
    return dst * (1 - w) + np.asarray(col, np.float32) * w

# ---------------- jacket: pull hue toward the v3 beige ----------------
mx, mn = rgb.max(-1), rgb.min(-1)
V = mx
S = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
c = mx - mn + 1e-6
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
H = np.where(mx == r, ((g - b) / c) % 6, np.where(mx == g, (b - r) / c + 2, (r - g) / c + 4)) / 6

TARGET_H = 0.085
w = (smooth(0.072, 0.095, H) * (1 - smooth(0.20, 0.23, H)) * smooth(0.05, 0.10, S)
     * smooth(-0.14, -0.10, Y) * (1 - smooth(0.26, 0.29, Y)) * ok)
H2 = H + (TARGET_H - H) * 0.9 * w
V2 = np.clip(V * (1 + 0.10 * w), 0, 1)
S2 = S
# hsv -> rgb
i = np.floor(H2 * 6).astype(int) % 6
f = H2 * 6 - np.floor(H2 * 6)
p, q, t = V2 * (1 - S2), V2 * (1 - S2 * f), V2 * (1 - S2 * (1 - f))
sel = [(V2, t, p), (q, V2, p), (p, V2, t), (p, q, V2), (t, p, V2), (V2, p, q)]
new = np.zeros_like(rgb)
for k, (a1, a2, a3) in enumerate(sel):
    m = i == k
    new[m] = np.stack([a1[m], a2[m], a3[m]], -1)
rgb = np.where((w > 0)[..., None], new, rgb)
print("jacket texels recolored:", int((w > 0.5).sum()))

# ---------------- eyes ----------------
R_IRIS = 0.0132
RX, RY = 1.78 * R_IRIS, 1.0 * R_IRIS
LID = 0.0024
AA = 0.0006
SCLERA = (0.96, 0.95, 0.93)
IRIS_OUT = (0.13, 0.08, 0.06)
IRIS_IN = (0.24, 0.15, 0.10)
PUPIL = (0.04, 0.03, 0.03)
LASH = (0.10, 0.07, 0.06)
face = ok & (NZ > 0.25) & (Z > 0.05) & (Z < 0.088) & (Y > 0.31) & (Y < 0.40)

for cx in (-0.0356, 0.0355):
    cy = 0.3558
    dx, dy = X - cx, Y - cy
    u = np.clip(np.abs(dx) / RX, 0, 1.5)
    top = RY * np.clip(1 - u ** 2, 0, 1) ** 0.6           # almond half-height at this dx
    inside = (np.abs(dx) < RX) & (np.abs(dy) < top)
    # signed distance-ish to the almond outline (vertical)
    edge = top - np.abs(dy)
    w_eye = face * smooth(-AA, AA, edge) * (np.abs(dx) < RX * 1.02)
    rgb = mix(rgb, SCLERA, w_eye)

    rr = np.hypot(dx, dy)
    w_iris = w_eye * smooth(R_IRIS + AA, R_IRIS - AA, rr)
    k = np.clip(rr / R_IRIS, 0, 1)[..., None]
    iris_col = np.asarray(IRIS_IN) * (1 - k) + np.asarray(IRIS_OUT) * k
    # slightly lighter lower half
    iris_col = iris_col * (1 + 0.25 * np.clip(-dy / R_IRIS, 0, 1))[..., None]
    rgb = rgb * (1 - w_iris[..., None]) + iris_col * w_iris[..., None]
    rgb = mix(rgb, PUPIL, w_eye * smooth(0.5 * R_IRIS + AA, 0.5 * R_IRIS - AA, rr))
    hl = np.hypot(dx - 0.36 * R_IRIS, dy - 0.38 * R_IRIS)
    rgb = mix(rgb, (1, 1, 1), w_eye * smooth(0.21 * R_IRIS + AA, 0.21 * R_IRIS - AA, hl))

    # upper lid line hugging the top edge, thicker toward the outer corner
    above = dy - top
    outer = np.clip(dx * np.sign(cx) / RX, 0, 1)
    thick = LID * (0.8 + 0.6 * outer)
    w_lid = face * (dy > -0.2 * RY) * (np.abs(dx) < RX * 1.08) * smooth(-AA, AA, above + 0.0004) * smooth(thick + AA, thick - AA, above)
    rgb = mix(rgb, LASH, w_lid)
    print("eye", cx, "texels", int((w_eye > 0.5).sum()))

outimg = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)[::-1]
alpha = (np.clip(base[..., 3], 0, 1) * 255 + 0.5).astype(np.uint8)[::-1]
Image.fromarray(np.dstack([outimg, alpha]) if alpha.min() < 255 else outimg).save(out)
np.save(d + "/base-fixed.npy", np.dstack([rgb, base[..., 3:]]).astype(np.float32))
print("saved", out)
