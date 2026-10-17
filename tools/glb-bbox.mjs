// 算 GLB 里所有网格的世界坐标包围盒，用于设置 3D 取景。
//
// 注意：不能用 accessor 的 min/max 直接当世界坐标。混元生3D 导出的模型
// 顶点是量化过的（normalized i16），真实尺寸要靠节点的 TRS 变换还原；
// 而且模型通常被绕 X 轴转了 90°，Y 轴才是高度。
//
// 用法：node tools/glb-bbox.mjs <file.glb> [fov]
import { readFile } from 'node:fs/promises'

const file = process.argv[2]
const FOV = Number(process.argv[3] ?? 34)
if (!file) throw new Error('用法：node tools/glb-bbox.mjs <file.glb> [fov]')

const buf = await readFile(file)
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('不是 GLB 文件')
const jsonLen = buf.readUInt32LE(12)
const g = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))

/** 单位阵（3x3 线性部分 + 平移） */
const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

/** 列主序 4x4 → [m00..m22, tx,ty,tz] */
function fromMatrix16(m) {
  return [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14]]
}

function fromTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0],
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1],
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2],
    t[0], t[1], t[2],
  ]
}

/** parent ∘ child */
function mul(p, c) {
  const o = new Array(12)
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      o[col * 3 + row] =
        p[row] * c[col * 3] + p[3 + row] * c[col * 3 + 1] + p[6 + row] * c[col * 3 + 2]
    }
  }
  for (let row = 0; row < 3; row++) {
    o[9 + row] = p[row] * c[9] + p[3 + row] * c[10] + p[6 + row] * c[11] + p[9 + row]
  }
  return o
}

function apply(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2] + m[9],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2] + m[10],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2] + m[11],
  ]
}

const NORM_DIV = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }
function accessorBounds(acc) {
  if (!acc?.min || !acc?.max) return null
  const div = acc.normalized ? (NORM_DIV[acc.componentType] ?? 1) : 1
  return { min: acc.min.map((v) => v / div), max: acc.max.map((v) => v / div) }
}

const min = [Infinity, Infinity, Infinity]
const max = [-Infinity, -Infinity, -Infinity]
let prims = 0

function visit(nodeIndex, parent) {
  const n = g.nodes[nodeIndex]
  if (!n) return
  const local = n.matrix ? fromMatrix16(n.matrix) : fromTRS(n.translation, n.rotation, n.scale)
  const world = mul(parent, local)

  if (n.mesh != null) {
    for (const prim of g.meshes[n.mesh].primitives ?? []) {
      const b = accessorBounds(g.accessors[prim.attributes?.POSITION])
      if (!b) continue
      prims++
      for (let i = 0; i < 8; i++) {
        const corner = [
          i & 1 ? b.max[0] : b.min[0],
          i & 2 ? b.max[1] : b.min[1],
          i & 4 ? b.max[2] : b.min[2],
        ]
        const w = apply(world, corner)
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], w[k])
          max[k] = Math.max(max[k], w[k])
        }
      }
    }
  }
  for (const c of n.children ?? []) visit(c, world)
}

for (const scene of g.scenes ?? []) for (const r of scene.nodes ?? []) visit(r, identity())

if (!prims) throw new Error('没找到带 POSITION 的网格')

const size = max.map((v, i) => v - min[i])
const center = max.map((v, i) => (v + min[i]) / 2)
const f = (arr) => arr.map((v) => v.toFixed(4)).join(', ')

console.log('文件            :', file)
console.log('网格 primitive 数:', prims)
console.log('bboxMin         :', f(min))
console.log('bboxMax         :', f(max))
console.log('尺寸 (宽,高,深)  :', f(size))
console.log('几何中心        :', f(center))
console.log('')
console.log('MODEL.yOffset   =', (-center[1]).toFixed(3), '  ← 让身体中心落在世界原点')
// 相机在 z 轴上正对世界原点，竖幅画布的可见高度 = 2·d·tan(fov/2)。
// 取 1.03 倍模型高度（上下各留约 1.5% 余量）反解 d。
const d = (size[1] * 1.03) / (2 * Math.tan((FOV / 2) * (Math.PI / 180)))
console.log('MODEL.cameraZ   =', d.toFixed(2), `  ← fov ${FOV}，刚好装下全身再留一点余量`)
