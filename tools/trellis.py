"""Image -> 3D via the free TRELLIS.2 Hugging Face Space (microsoft/TRELLIS.2).

Usage:
  set HTTPS_PROXY=http://127.0.0.1:7892
  python tools/trellis.py <image> <out.glb> [--seed N] [--res 1024] [--faces 300000] [--tex 2048]

Optional: HF_TOKEN env var raises the ZeroGPU quota (free account).
"""
import argparse, os, shutil, sys, time

from gradio_client import Client, handle_file

ap = argparse.ArgumentParser()
ap.add_argument("image")
ap.add_argument("out")
ap.add_argument("--space", default="microsoft/TRELLIS.2")
ap.add_argument("--seed", type=int, default=0)
ap.add_argument("--res", default="1024", choices=["512", "1024", "1536"])
ap.add_argument("--faces", type=int, default=300000)
ap.add_argument("--tex", type=int, default=2048)
a = ap.parse_args()

if not os.environ.get("HF_TOKEN") and os.path.exists(".env"):
    for line in open(".env", encoding="utf-8-sig"):
        if line.startswith("HF_TOKEN="):
            os.environ["HF_TOKEN"] = line.split("=", 1)[1].strip()

t0 = time.time()
def log(m):
    print(f"[{time.time() - t0:6.1f}s] {m}", flush=True)

client = Client(a.space, token=os.environ.get("HF_TOKEN") or None, verbose=False)
log("connected")
client.predict(api_name="/start_session")

pre = client.predict(handle_file(a.image), api_name="/preprocess_image")
log(f"preprocessed -> {pre}")
pre_path = pre["path"] if isinstance(pre, dict) else pre
os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
shutil.copy(pre_path, os.path.splitext(a.out)[0] + "-input.png")

client.predict(
    handle_file(pre_path), a.seed, a.res,
    7.5, 0.7, 12, 5.0,
    7.5, 0.5, 12, 3.0,
    1.0, 0.0, 12, 3.0,
    api_name="/image_to_3d",
)
log("generated")

glb, dl = client.predict(a.faces, a.tex, api_name="/extract_glb")
src = dl if isinstance(dl, str) else glb
os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
shutil.copy(src, a.out)
log(f"saved {a.out} ({os.path.getsize(a.out) / 1e6:.1f} MB)")
