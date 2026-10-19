// 眼球着色。Tripo 给的每只眼球只有约 350 个顶点，顶点色在放大后只能画出色块（瞳孔、高光变成几团）。
// 这里直接在着色器里按"到眼球中心的投影距离"解析地画：眼白（杏仁形开口）、上眼线、虹膜、瞳孔、两处高光。
// 与分辨率无关，任何缩放下边缘都是实的；参数与 tools/tripo-n2.json 里的 eyes 项一一对应。
//
// 坐标约定：模型局部空间（= 绑定姿势），Y 向上，正面朝 +Z，眼球在 XY 平面上是一个近似圆。
// 用绑定姿势的 position 而不是变换后的位置，所以转头、挥手动起来eye 也跟着头部骨骼走，不需要每帧更新。

import * as THREE from 'three'

/** 相对眼球半径的比例，来自 tools/tripo-n2.json 的 eyes 参数（iris 半径 0.0192 / 眼球正面半径 0.046） */
export const EYE = {
  /** 虹膜半径 / 眼球半径 */
  irisFrac: 0.42,
  /** 虹膜中心相对眼球中心往鼻梁方向的偏移、往上的偏移（× 眼球半径） */
  inward: 0.08,
  up: 0.02,
  /** 眼裂（杏仁开口）半宽 / 半高，× 虹膜半径。半高小于虹膜半径：上眼睑会压住虹膜顶部 */
  open: [1.6, 0.78] as [number, number],
  /** 眼裂中心相对虹膜中心下移多少（× 虹膜半径），越大眼睛越"松" */
  openDy: -0.1,
  /** 瞳孔半径、两处高光的 (x, y, 半径)，× 虹膜半径 */
  pupil: 0.42,
  hiA: [0.32, 0.34, 0.19] as [number, number, number],
  hiB: [-0.34, -0.36, 0.08] as [number, number, number],
} as const

const C = {
  sclera: '#eae4db', // 眼白，偏暖的米白（设计图里不是纯白，纯白会亮得发假）
  lid: '#2d1e1a', // 上眼线
  irisIn: '#603822', // 虹膜（靠中心，暖棕）
  irisOut: '#26160e', // 虹膜（靠边缘，近黑，形成角巩膜环）
  pupil: '#0c0806',
  skin: '#dab29d', // 眼睑皮肤 = 肤色 × 0.9
}

const FRAG = /* glsl */ `
uniform vec4 uEye[2];          // xy = 眼球中心，z = 眼球半径，w = 往鼻梁的方向（±1）
uniform vec3 uSclera, uLid, uIrisIn, uIrisOut, uPupil, uEyeSkin;
uniform vec2 uOpen;
uniform float uIrisFrac, uInward, uUp, uPupilFrac, uOpenDy;
uniform vec3 uHiA, uHiB;
varying vec3 vEyePos;

vec3 eyeAlbedo(vec3 p) {
  vec3 col = uEyeSkin;
  for (int i = 0; i < 2; i++) {
    vec4 e = uEye[i];
    float R = e.z;
    float r = uIrisFrac * R;
    float near = 1.0 - smoothstep(R * 1.04, R * 1.5, length(p.xy - e.xy));
    if (near <= 0.0) continue;
    vec2 d = p.xy - (e.xy + vec2(e.w * uInward * R, uUp * R));   // 虹膜中心（略朝鼻梁）
    vec2 dOpen = d - vec2(0.0, uOpenDy * r);                     // 眼裂中心（略低 = 上眼睑压住虹膜顶）
    float dd = length(d) / r;
    float e2 = length(vec2(dOpen.x / (r * uOpen.x), dOpen.y / (r * uOpen.y)));
    float aa = max(fwidth(e2), 1e-5) * 1.5;
    float opening = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, e2)) * near;

    col = mix(col, uSclera, opening);                                    // 眼白
    float rim = 1.0 - smoothstep(0.0, aa * 6.0, abs(e2 - 1.0));          // 上眼线
    col = mix(col, uLid, rim * smoothstep(-0.35, 0.15, dOpen.y / (r * uOpen.y)) * near);
    col = mix(col, mix(uIrisIn, uIrisOut, smoothstep(0.5, 0.98, dd)),    // 虹膜
              (1.0 - smoothstep(1.0 - aa, 1.0 + aa, dd)) * opening);
    col = mix(col, uPupil,                                               // 瞳孔
              (1.0 - smoothstep(uPupilFrac - aa, uPupilFrac + aa, dd)) * opening);
    // 高光：半径也换算成"以虹膜半径为单位"，否则 0.2 会被当成 0.2 个模型单位（= 5 个虹膜）刷满整颗眼
    float dA = length(d - uHiA.xy * r) / r;
    col = mix(col, vec3(1.0), (1.0 - smoothstep(uHiA.z - aa, uHiA.z + aa, dA)) * opening);
    float dB = length(d - uHiB.xy * r) / r;
    col = mix(col, vec3(1.0), (1.0 - smoothstep(uHiB.z - aa, uHiB.z + aa, dB)) * opening * 0.9);
  }
  return col;
}
`

/** 给材质名为 eye 的网格换成本文件的解析眼球。眼睛之外的 parts 不动。 */
export function applyEyeShading(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && (m.material as THREE.Material)?.name === 'eye') meshes.push(m)
  })
  if (!meshes.length) return

  // 两只眼球的位置和半径从几何里量（不写死坐标：换模型只要 parts 还叫 eye 就自动对）
  const centres: THREE.Vector4[] = []
  const radii: number[] = []
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position')
    for (const side of [-1, 1] as const) {
      let n = 0
      let cx = 0
      let cy = 0
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        if (Math.sign(x) !== side) continue
        cx += x
        cy += pos.getY(i)
        n++
      }
      if (n < 8) continue
      cx /= n
      cy /= n
      let R = 0
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        if (Math.sign(x) !== side) continue
        R = Math.max(R, Math.hypot(x - cx, pos.getY(i) - cy))
      }
      radii.push(R)
      centres.push(new THREE.Vector4(cx, cy, R, -Math.sign(cx) || 1))
    }
  }
  if (centres.length !== 2) return
  // 两只眼用同一个半径，避免个别顶点让一边大一边小
  const R = (radii[0] + radii[1]) / 2
  for (const c of centres) c.z = R

  const lin = (hex: string) => new THREE.Color(hex)
  const uniforms = {
    uEye: { value: centres },
    uSclera: { value: lin(C.sclera) },
    uLid: { value: lin(C.lid) },
    uIrisIn: { value: lin(C.irisIn) },
    uIrisOut: { value: lin(C.irisOut) },
    uPupil: { value: lin(C.pupil) },
    uEyeSkin: { value: lin(C.skin) },
    uOpen: { value: new THREE.Vector2(...EYE.open) },
    uIrisFrac: { value: EYE.irisFrac },
    uInward: { value: EYE.inward },
    uUp: { value: EYE.up },
    uPupilFrac: { value: EYE.pupil },
    uOpenDy: { value: EYE.openDy },
    uHiA: { value: new THREE.Vector3(...EYE.hiA) },
    uHiB: { value: new THREE.Vector3(...EYE.hiB) },
  }

  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.vertexColors = false // 顶点色在这里只会干扰（画不出细节的那一层）
    // 眼球只有几毫米，法线贴图在这么小的 UV 岛上是噪声，会把整颗眼珠的反射打乱成一片白
    if ('normalMap' in mat) (mat as THREE.MeshStandardMaterial).normalMap = null
    mat.roughness = 0.7
    mat.envMapIntensity = 0.15
    mat.metalness = 0
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEyePos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvEyePos = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG}`)
        .replace('#include <map_fragment>', '\tdiffuseColor.rgb = eyeAlbedo(vEyePos);')
    }
    mat.needsUpdate = true
  }
}
