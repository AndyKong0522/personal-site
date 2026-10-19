// 发丝细节。网格在减面后只剩"一缕一缕"的走势，表面本身是平的；这里在片元里叠一层
// **沿走向拉长的 3D 噪声**扰动法线，让每缕头发有自己的高光边和暗沟，不用加面数、不用贴图。
//
// 用 view 空间做 bump（Mikkelsen 的无切线 bump）：法线在标准材质里已经是 view 空间，
// 拿 dFdx/dFdy 求出屏幕梯度再回推切平面，所以不需要 TANGENT 属性，也不会被 UV 接缝影响。

import * as THREE from 'three'

export const HAIR = {
  /** 噪声频率（以模型单位计，模型高约 1.86）——数值越大发丝越细 */
  freq: 22,
  /** 沿 Y（发丝往下走的方向）拉长的倍数：>1 时噪声在竖直方向被压缩成条 */
  stretch: 3.0,
  /** 凹凸强度 */
  bump: 1.0,
}

const FRAG = /* glsl */ `
uniform float uHairFreq, uHairStretch, uHairBump;
varying vec3 vHairPos;

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

/** 两段噪声叠出粗细不一的发丝；沿 Y 压扁 = 竖着拉的条 */
float hairHeight(vec3 p) {
  vec3 q = vec3(p.x * uHairFreq, p.y * uHairFreq / uHairStretch, p.z * uHairFreq);
  return vnoise(q) * 0.65 + vnoise(q * 2.7) * 0.35;
}
`

/** 给材质名为 hair 的网格加发丝凹凸。brow 单独一个材质，不会被带上。 */
export function applyHairDetail(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && (m.material as THREE.Material)?.name === 'hair') meshes.push(m)
  })
  if (!meshes.length) return

  const uniforms = {
    uHairFreq: { value: HAIR.freq },
    uHairStretch: { value: HAIR.stretch },
    uHairBump: { value: HAIR.bump },
  }

  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vHairPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHairPos = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG}`)
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
          {
            float hh = hairHeight(vHairPos);
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
    mat.needsUpdate = true
  }
}
