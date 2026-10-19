// 头像的所有着色器改动集中在这里，**所有材质共用同一个着色器程序**。
//
// 为什么合并：three.js 的程序缓存键里包含 onBeforeCompile 的源码，材质各自挂不同的补丁就会各自编译一份。
// 实测首屏 465ms 里绝大部分是编译/链接着色器；把三份合成一份（眼球 + 发丝共用一个 patch，靠 uEyeOn /
// uHairOn 这两个 uniform 分流）能把程序数从 3~4 个降到 1 个，首屏和相机第一次看到的延迟都明显变短。
// 分支是 uniform 级的，GPU 上整个 draw call 走同一条路径，不开这一路的材质不会真正执行那段代码。
//
// 坐标约定：模型局部空间（绑定姿势），Y 向上，正面朝 +Z。用 position 而不是变换后的位置，
// 所以转头、挥手动起来细节跟着骨骼走，不需要每帧更新。

import * as THREE from 'three'

/** 眼球参数：比例来自 tools/tripo-n2.json 的 eyes 项（iris 半径 0.0192 / 眼球正面半径 0.046） */
export const EYE = {
  irisFrac: 0.42,
  inward: 0.08,
  up: 0.02,
  open: [1.6, 0.78] as [number, number],
  openDy: -0.1,
  pupil: 0.42,
  hiA: [0.32, 0.34, 0.19] as [number, number, number],
  hiB: [-0.34, -0.36, 0.08] as [number, number, number],
}

/** 发丝凹凸参数 */
export const HAIR = {
  /** 噪声频率（模型单位，人物高约 1.86） */
  freq: 22,
  /** 沿 Y（发丝往下走）拉长的倍数：>1 时噪声被压成竖条 */
  stretch: 3.0,
  /** 凹凸强度 */
  bump: 1.0,
}

const COL = {
  sclera: '#eae4db',
  lid: '#2d1e1a',
  irisIn: '#603822',
  irisOut: '#26160e',
  pupil: '#0c0806',
  skin: '#dab29d',
}

const GLSL = /* glsl */ `
uniform float uEyeOn, uHairOn;
uniform vec4 uEye[2];
uniform vec3 uSclera, uLid, uIrisIn, uIrisOut, uPupil, uEyeSkin;
uniform vec2 uOpen;
uniform float uIrisFrac, uInward, uUp, uPupilFrac, uOpenDy;
uniform vec3 uHiA, uHiB;
uniform float uHairFreq, uHairStretch, uHairBump;
varying vec3 vAvPos;

vec3 eyeAlbedo(vec3 p) {
  vec3 col = uEyeSkin;
  for (int i = 0; i < 2; i++) {
    vec4 e = uEye[i];
    float R = e.z;
    float r = uIrisFrac * R;
    float near = 1.0 - smoothstep(R * 1.04, R * 1.5, length(p.xy - e.xy));
    if (near <= 0.0) continue;
    vec2 d = p.xy - (e.xy + vec2(e.w * uInward * R, uUp * R));
    vec2 dOpen = d - vec2(0.0, uOpenDy * r);
    float dd = length(d) / r;
    float e2 = length(vec2(dOpen.x / (r * uOpen.x), dOpen.y / (r * uOpen.y)));
    float aa = max(fwidth(e2), 1e-5) * 1.5;
    float opening = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, e2)) * near;

    col = mix(col, uSclera, opening);
    float rim = 1.0 - smoothstep(0.0, aa * 6.0, abs(e2 - 1.0));
    col = mix(col, uLid, rim * smoothstep(-0.35, 0.15, dOpen.y / (r * uOpen.y)) * near);
    col = mix(col, mix(uIrisIn, uIrisOut, smoothstep(0.5, 0.98, dd)),
              (1.0 - smoothstep(1.0 - aa, 1.0 + aa, dd)) * opening);
    col = mix(col, uPupil,
              (1.0 - smoothstep(uPupilFrac - aa, uPupilFrac + aa, dd)) * opening);
    float dA = length(d - uHiA.xy * r) / r;
    col = mix(col, vec3(1.0), (1.0 - smoothstep(uHiA.z - aa, uHiA.z + aa, dA)) * opening);
    float dB = length(d - uHiB.xy * r) / r;
    col = mix(col, vec3(1.0), (1.0 - smoothstep(uHiB.z - aa, uHiB.z + aa, dB)) * opening * 0.9);
  }
  return col;
}

float h31(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = h31(i), n100 = h31(i + vec3(1.0, 0.0, 0.0));
  float n010 = h31(i + vec3(0.0, 1.0, 0.0)), n110 = h31(i + vec3(1.0, 1.0, 0.0));
  float n001 = h31(i + vec3(0.0, 0.0, 1.0)), n101 = h31(i + vec3(1.0, 0.0, 1.0));
  float n011 = h31(i + vec3(0.0, 1.0, 1.0)), n111 = h31(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z);
}
float hairHeight(vec3 p) {
  vec3 q = vec3(p.x * uHairFreq, p.y * uHairFreq / uHairStretch, p.z * uHairFreq);
  return vnoise(q) * 0.65 + vnoise(q * 2.7) * 0.35;
}
`

/** 同一个函数给所有材质用（缓存键只看源码，所以它们共享一个程序） */
function patch(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vAvPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAvPos = position;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL}`)
    .replace(
      '#include <map_fragment>',
      '\tif (uEyeOn > 0.5) diffuseColor.rgb = eyeAlbedo(vAvPos);',
    )
    .replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      if (uHairOn > 0.5) {
        float hh = hairHeight(vAvPos);
        vec3 dpx = dFdx(-vViewPosition);
        vec3 dpy = dFdy(-vViewPosition);
        vec3 r1 = cross(dpy, normal);
        vec3 r2 = cross(normal, dpx);
        float det = dot(dpx, r1);
        vec3 grad = sign(det) * (dFdx(hh) * r1 + dFdy(hh) * r2);
        normal = normalize(abs(det) * normal - uHairBump * grad);
      }`,
    )
}

/**
 * 给整棵模型挂上统一补丁。眼球网格的顶点色必须是白的（`tools/tripo-vcol.py` 里写了），
 * 因为这个补丁只会覆盖 diffuseColor，之后 three 还会再乘一次顶点色。
 */
export function applyAvatarShading(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) meshes.push(m)
  })
  if (!meshes.length) return
  // 两只眼球的位置和半径从几何里量（不写死坐标）
  const eyeMeshes = meshes.filter((m) => (m.material as THREE.Material)?.name === 'eye')
  const centres: THREE.Vector4[] = []
  const radii: number[] = []
  for (const mesh of eyeMeshes) {
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
  const avgR = radii.length ? radii.reduce((a, b) => a + b, 0) / radii.length : 0
  for (const c of centres) c.z = avgR
  while (centres.length < 2) centres.push(new THREE.Vector4())

  const lin = (hex: string) => new THREE.Color(hex)
  // 注意：程序缓存键 = onBeforeCompile.toString()，所有材质必须用**同一份源码**的包装函数才能共享程序；
  // 下面这个 wrapper 在循环里生成，源码文本一致，只是闭包变量不同，所以键相同。
  const makePatch = (mat: THREE.MeshStandardMaterial) =>
    function (shader: THREE.WebGLProgramParametersWithUniforms) {
      Object.assign(shader.uniforms, mat.userData.shading)
      patch(shader)
    }

  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial
    const name = mat.name
    const isEye = name === 'eye'
    const isHair = name === 'hair'
    if (isEye) {
      // 眼球只有几毫米：镜面反射会把整颗眼珠打成一团白。法线贴图保留（否则 defines 不同、
      // 要多编一个程序），但把强度归零 —— 那个 UV 岛太小，贴图在眼球上只是噪声。
      mat.roughness = 0.7
      mat.envMapIntensity = 0.15
      mat.metalness = 0
      if (mat.normalMap) mat.normalScale.set(0, 0)
    }
    mat.userData.shading = {
      uEyeOn: { value: isEye ? 1 : 0 },
      uHairOn: { value: isHair ? 1 : 0 },
      uEye: { value: centres },
      uSclera: { value: lin(COL.sclera) },
      uLid: { value: lin(COL.lid) },
      uIrisIn: { value: lin(COL.irisIn) },
      uIrisOut: { value: lin(COL.irisOut) },
      uPupil: { value: lin(COL.pupil) },
      uEyeSkin: { value: lin(COL.skin) },
      uOpen: { value: new THREE.Vector2(EYE.open[0], EYE.open[1]) },
      uIrisFrac: { value: EYE.irisFrac },
      uInward: { value: EYE.inward },
      uUp: { value: EYE.up },
      uPupilFrac: { value: EYE.pupil },
      uOpenDy: { value: EYE.openDy },
      uHiA: { value: new THREE.Vector3(...EYE.hiA) },
      uHiB: { value: new THREE.Vector3(...EYE.hiB) },
      uHairFreq: { value: HAIR.freq },
      uHairStretch: { value: HAIR.stretch },
      uHairBump: { value: HAIR.bump },
    }
    mat.onBeforeCompile = makePatch(mat)
    mat.needsUpdate = true
  }
}
