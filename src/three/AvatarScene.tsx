// 3D 场景。单独打包、懒加载：首屏先显示占位图，three.js 加载完再替换。
//
// 模型带 28 根骨骼（混元绑骨输出），但服务返回的动画重定向失败会把模型扭变形
// （绑定姿势本身是好的，见 shots/bind-pose.png），所以这里自己驱动骨骼。
//
// 所有转动都在**模型空间**里定义（X = 人物的左手方向，Y = 上，Z = 朝向镜头），
// 再换算成每根骨骼的局部旋转。不直接绕骨骼局部轴转：这套骨骼的局部轴是斜的，
// 绕局部 X 轴"点头"会混进歪头和摇头。

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
// 不用 drei 的 <Environment preset>：它会从外部 CDN 下载 HDR，拖慢首屏。
import * as THREE from 'three'
import { applyAvatarShading } from './avatarShading'
import { AVATAR_MODEL } from '../models'
import { useAvatarGLTF } from './useAvatarGLTF'

/** 当前模型。换模型只改 url 即可——GltfAvatar 会在加载后自动量包围盒、
    缩放到 AVATAR_HEIGHT 并把身体中心对到世界原点，所以取景参数与模型无关。 */
const MODEL = {
  // v1 设计图 → Tripo（白模）+ tools/tripo-vcol.py 顶点色/AO + tools/blender-rig.py 绑骨，28 根骨骼，程序化驱动
  url: AVATAR_MODEL.full,
  // 同一条管线出的 4 万面小样：先连它把人物显示出来，全尺寸在后台接着下载，好了直接换。
  // 两个模型的骨骼、尺度、静止姿势完全一致（同一个绑骨脚本），所以替换时不会跳。
  lite: AVATAR_MODEL.lite,
}

/** 归一化后的统一高度。相机距离按这个高度调，换模型不用重新调。 */
const AVATAR_HEIGHT = 1.24
/** 可见高度 = 2·z·tan(fov/2) = 1.32，上下各留约 7% 余量，鞋底不会被画布下沿切掉。 */
const CAMERA_Z = 2.16
/** 渲染分辨率上限。2.0 在 4K / 高分屏上等于四倍像素量，人像本身不需要那么细；
    帧率不够时 AdaptiveDpr 会再往下调。 */
const MAX_DPR = 1.5
/** 画质阶梯。从中间一档起步（快、但不至于糊），之后按实测帧时间上下移动：
    能稳定跑满 vsync 就往上升，掉到 38fps 以下就往下降。
    分辨率走 state（Canvas 的 dpr 属性），不用命令式 setDpr：后者会被重渲染时重新应用的
    dpr 属性盖回去，实测降下去又被拽回上限。 */
const LEVELS = [
  { dpr: 1, shadows: false }, // 0 最省：低分屏 + 无阴影
  { dpr: 1.25, shadows: false }, // 1 起步档
  { dpr: MAX_DPR, shadows: false }, // 2 满分辨率
  { dpr: MAX_DPR, shadows: true }, // 3 全开：分辨率满 + 主光自身阴影
] as const
const START_LEVEL = 1

/** 灯光强度：半球环境光（压得很低，主要靠环境立方图和主光塑形）、主光（右前上）、补光（左前）、轮廓光（后上） */
const HEMI = 0.25
const KEY = 2.05
const FILL = 0.55
const RIM = 0.7
/** 环境立方图的强度（程序生成的摄影棚，见 StudioEnv） */
const ENV = 0.42
const KEY_POS: [number, number, number] = [2.5, 4, 5]

/** 待机时头抬起的角度。v3 的绑定姿势是低头的（需要 0.42 rad 补回来）；
    现在的模型（TRELLIS 生成 + tools/blender-rig.py 绑骨）绑定时头是正的，只再抬一点点显得精神。 */
const HEAD_LIFT = 0.06
/** 头跟随光标：左右幅度；往上看的幅度；往下看的幅度（往下的幅度小一些，
    光标停在下方文字区时不会显得在瞪地）。 */
const LOOK = { yaw: 0.58, up: 0.3, down: 0.1 }

/** 挥手时上臂、前臂在模型空间里要指向的方向（人物左臂；右臂把 x 取反）。
    上臂往**外**抬、略朝下，前臂再往上翻——手落在肩膀外侧、下巴高度。
    两点约束是量过的：头很大（半径约 0.2、中心 x≈0.08），手要避开它就得靠"往外"
    而不是"往上"；同时上臂转得越小，腋下那几个顶点被拉出的丝越轻。 */
const WAVE_UPPER = new THREE.Vector3(0.45, -0.82, 0.34).normalize()
const WAVE_FORE = new THREE.Vector3(0.3, 0.95, 0.2).normalize()
/** 前臂左右摆的幅度（弧度）和频率 */
const WAVE_SWING = 0.36
const WAVE_FREQ = 8.5
const WAVE_DUR = 2.4
/** 肩骨分担多少抬臂。剩下的才由大臂承担——分得多，腋下每个顶点要拉伸的量就少，
    网格就不容易被拉出薄网（实测 0.25 时很明显）。 */
const SHOULDER_SHARE = 0.5

/** 脖子分担多少俯仰。调大会把头整体往后挪（头骨位置跟着脖子转），
    但头的朝向由 HEAD_LIFT 单独决定，不会跟着后仰。实测从 0.4 调到 0.62，
    侧面轮廓的前倾量少了约 26%。 */
const NECK_SHARE = 0.62

/** 点头：只往下点，点两下 */
const NOD_AMP = 0.24
const NOD_BEAT = 0.5
const NOD_DUR = NOD_BEAT * 2

export type Pointer = { x: number; y: number }

/** 拖动产生的额外旋转（相对待机姿态），松手后缓回 0 */
type DragState = { x: number; y: number; active: boolean }

type Props = {
  /** 滚动进度 0–1，由页面写入，场景每帧读取（不触发 React 重渲染）。 */
  scrollProgress: React.RefObject<number>
  /** 光标位置，范围 -1~1，同样每帧读取。 */
  pointer: React.RefObject<Pointer>
  /** 减少动态效果时关闭跟随鼠标、待机摆动和滚动转身。 */
  reducedMotion: boolean
  /** 人像不在视口里时暂停渲染（R3F 用 demand 帧循环，不再每帧抢 GPU）。 */
  paused?: boolean
  onReady?: () => void
}

export default function AvatarScene({ scrollProgress, pointer, reducedMotion, paused, onReady }: Props) {
  const drag = useRef<DragState>({ x: 0, y: 0, active: false })
  const [level, setLevel] = useState(START_LEVEL)
  const dpr = LEVELS[level].dpr
  const shadowsOn = LEVELS[level].shadows

  // 给 ?stats=1 的角标看：现在是哪一档画质
  useEffect(() => {
    document.documentElement.dataset.avatarShadows = shadowsOn ? '1' : '0'
    document.documentElement.dataset.avatarLevel = String(level)
  }, [shadowsOn, level])

  return (
    <Canvas
      // near/far 必须贴着实际场景收紧：模型高 1.147、相机在 z=2.16，最近处约 1.5、最远处约 2.8。
      // 用 three.js 默认的 0.1/1000 会把深度精度浪费掉近两个数量级，
      // 夹克内层与卫衣外层几乎共面时就出现锯齿状 z-fighting（表现为"破洞/碎裂面"）。
      camera={{ position: [0, 0, CAMERA_Z], fov: 34, near: 1.2, far: 6 }}
      dpr={dpr}
      // PCFSoft 每像素要做十几次阴影采样；PCF 只要 4 次，柔和的观感靠 normalBias 和烘焙 AO 补
      shadows={{ type: THREE.PCFShadowMap }}
      // low-power 会让浏览器优先挑省电显卡（笔记本上就是核显），这里要的是性能
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      // 人像滚出视口 / 减少动态效果时用 demand：只在 invalidate 时画一帧
      frameloop={reducedMotion || paused ? 'demand' : 'always'}
      onCreated={({ gl }) => {
        // R3F 默认 ACES 会把肤色、夹克的中间调压灰压暗；Neutral 更忠实于贴图（贴图按 2D 设计图取色）
        gl.toneMapping = THREE.NeutralToneMapping
        onReady?.()
      }}
      aria-hidden="true"
    >
      {/* 浅色纸感页面上的打光：主光偏右前上并投自身阴影（下巴、发际、腋下、夹克褶皱靠它出来），
          环境立方图给眼镜/鞋一点反射，半球光只补一点天光。贴图里另有一层很轻的顶点 AO。 */}
      <StudioEnv />
      <hemisphereLight args={['#ffffff', '#efe9df', HEMI]} />
      <directionalLight
        position={KEY_POS}
        intensity={KEY}
        color="#fffdf8"
        castShadow={shadowsOn}
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.08}
        shadow-camera-left={-1.2}
        shadow-camera-right={1.2}
        shadow-camera-top={1.2}
        shadow-camera-bottom={-1.2}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
      />
      <directionalLight position={[-4, 1.5, 3]} intensity={FILL} color="#f4f6fa" />
      <directionalLight position={[-1.5, 2.6, -3.5]} intensity={RIM} color="#ffffff" />
      <Suspense fallback={null}>
        <AdaptiveQuality reducedMotion={reducedMotion} level={level} onLevel={setLevel} />
        <Rig scrollProgress={scrollProgress} reducedMotion={reducedMotion} drag={drag}>
          <ProgressiveAvatar reducedMotion={reducedMotion} pointer={pointer} drag={drag} />
        </Rig>
      </Suspense>
    </Canvas>
  )
}

/** 画质自适应。启动后先跳过 2 秒（加载、入场动画、着色器编译都在这一段，拿它做判断会误判——
    上一版就是因此在启动时把分辨率误降了一档），然后每 30 帧看一次平均帧时间：
    · 稳定跑满 vsync（平均 ≤18.5ms）→ 升一档
    · 掉到 38fps 以下（>26ms）→ 降一档
    · 两者之间 → 保持
    每次升降后重新等 2 秒再量（避免把切换的抖动算进去），最多移动 4 次就停手。 */
function AdaptiveQuality({
  reducedMotion,
  level,
  onLevel,
}: {
  reducedMotion: boolean
  level: number
  onLevel: (n: number) => void
}) {
  const st = useRef({ n: 0, sum: 0, warm: 0, moves: 0 })

  useFrame((_, delta) => {
    const s = st.current
    if (reducedMotion || s.moves >= 4) return
    s.warm += delta
    if (s.warm < 2) return
    s.n++
    s.sum += delta
    if (s.n < 30) return
    const avg = s.sum / s.n
    s.n = 0
    s.sum = 0
    if (avg <= 0.0185 && level < LEVELS.length - 1) {
      onLevel(level + 1)
      s.moves++
      s.warm = 0
    } else if (avg > 0.026 && level > 0) {
      onLevel(level - 1)
      s.moves++
      s.warm = 0
    }
  })
  return null
}

/** 程序生成的摄影棚环境：等距柱状渐变（地面偏暖、天顶偏冷）+ 右前上方一块柔光窗。
    给皮肤、眼镜、鞋一点高光反射，比单一环境光更像"实拍的小泥人"；不下载 HDR，省一次请求。 */
function StudioEnv() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const W = 64
    const H = 32
    const data = new Uint16Array(W * H * 4)
    const half = THREE.DataUtils.toHalfFloat
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1) // 0 = 下方（地面反光），1 = 上方（天光）
      const base =
        v < 0.5
          ? [1.02, 0.98, 0.92].map((c) => c * (0.7 + 0.3 * (1 - v / 0.5)))
          : [0.92, 0.95, 1.0].map((c) => c * (0.9 + 0.35 * ((v - 0.5) / 0.5)))
      for (let x = 0; x < W; x++) {
        const u = x / W
        // 柔光窗：方位 0.18 圈、仰角 0.62 处的高斯亮斑
        const du = Math.min(Math.abs(u - 0.18), 1 - Math.abs(u - 0.18))
        const spot = Math.exp(-((du / 0.09) ** 2) - ((v - 0.62) / 0.2) ** 2) * 1.6
        const i = (y * W + x) * 4
        data[i] = half(base[0] + spot)
        data[i + 1] = half(base[1] + spot)
        data[i + 2] = half(base[2] + spot)
        data[i + 3] = half(1)
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType)
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.LinearSRGBColorSpace
    tex.needsUpdate = true
    const pm = new THREE.PMREMGenerator(gl)
    const rt = pm.fromEquirectangular(tex)
    scene.environment = rt.texture
    scene.environmentIntensity = ENV
    tex.dispose()
    pm.dispose()
    return () => {
      scene.environment = null
      rt.dispose()
    }
  }, [gl, scene])

  return null
}

/** 整体变换：滚动时转身后退 + 鼠标拖动旋转。没有上下浮动（会让鞋底被画布下沿切掉）。 */
function Rig({
  children,
  scrollProgress,
  reducedMotion,
  drag,
}: {
  scrollProgress: React.RefObject<number>
  reducedMotion: boolean
  drag: React.RefObject<DragState>
  children: React.ReactNode
}) {
  const group = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(delta, 0.05)
    const d = drag.current ?? { x: 0, y: 0, active: false }

    // 减少动态效果：不做自动回位（那需要持续渲染），拖到哪儿就停在哪儿
    if (reducedMotion) {
      g.rotation.y = d.x
      g.rotation.x = d.y
      g.position.z = 0
      return
    }

    if (!d.active) {
      d.x = THREE.MathUtils.damp(d.x, 0, 1.1, dt)
      d.y = THREE.MathUtils.damp(d.y, 0, 1.1, dt)
    }
    const p = scrollProgress.current ?? 0
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, p * Math.PI * 0.75 + d.x, 6, dt)
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, d.y, 6, dt)
    g.position.z = THREE.MathUtils.damp(g.position.z, -p * 1.6, 6, dt)
  })

  return <group ref={group}>{children}</group>
}

/** 程序化动画用到的骨骼（名字来自混元绑骨输出） */
const BONE_NAMES = {
  head: 'Head',
  neck: 'Neck',
  spine1: 'Spine1',
  spine2: 'Spine2',
  shoulderL: 'LeftShoulder',
  shoulderR: 'RightShoulder',
  armL: 'LeftArm',
  armR: 'RightArm',
  foreArmL: 'LeftForeArm',
  foreArmR: 'RightForeArm',
  handL: 'LeftHand',
  handR: 'RightHand',
} as const
type BoneKey = keyof typeof BONE_NAMES

/** 每根骨骼在绑定姿势下的数据。world / parentWorld 都是**模型空间**（相对 scene 根节点）的朝向。 */
type RestInfo = {
  local: THREE.Quaternion
  world: THREE.Quaternion
  parentWorld: THREE.Quaternion
  pos: THREE.Vector3
}

type Rigging = {
  bones: Partial<Record<BoneKey, THREE.Object3D>>
  rest: Map<string, RestInfo>
}

const ID = new THREE.Quaternion()
const AX = new THREE.Vector3(1, 0, 0)
const AY = new THREE.Vector3(0, 1, 0)
const AZ = new THREE.Vector3(0, 0, 1)
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _qc = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()

/** yaw（绕模型 Y）× pitch（绕模型 X，正值=低头）组成的模型空间旋转 */
function yawPitch(out: THREE.Quaternion, yaw: number, pitch: number) {
  _qa.setFromAxisAngle(AY, yaw)
  _qb.setFromAxisAngle(AX, pitch)
  return out.copy(_qa).multiply(_qb)
}

/** 这一帧已经驱动过的骨骼 → 它在模型空间里相对绑定姿势的转动。每帧开始时清空。 */
const driven = new Map<string, THREE.Quaternion>()

/** 最近一个被驱动的祖先的转动；没驱动的中间骨骼原样继承祖先的转动，所以往上找就行 */
function parentDeltaOf(bone: THREE.Object3D) {
  for (let p = bone.parent; p; p = p.parent) {
    const d = driven.get(p.uuid)
    if (d) return d
  }
  return ID
}

/** 让骨骼在模型空间里相对绑定姿势转动 delta（父骨骼要先驱动）。
    新的模型空间朝向 = delta · restWorld，父骨骼此时的朝向 = parentDelta · parentWorld，
    所以 局部 = parentWorld⁻¹ · parentDelta⁻¹ · delta · parentWorld · restLocal */
function drive(bone: THREE.Object3D | undefined, rest: Map<string, RestInfo>, delta: THREE.Quaternion) {
  const info = bone && rest.get(bone.uuid)
  if (!bone || !info) return
  _qc.copy(info.parentWorld).invert()
  _qc.multiply(_qa.copy(parentDeltaOf(bone)).invert())
  _qc.multiply(delta)
  _qc.multiply(info.parentWorld)
  _qc.multiply(info.local)
  bone.quaternion.copy(_qc)
  driven.set(bone.uuid, delta)
}

/** 第一次加载时记录绑定姿势。缓存在 scene 上：useGLTF 会复用同一个 scene，
    组件重新挂载时骨骼已经被动画改过，不能再拿当时的姿势当"绑定姿势"。 */
function captureRig(scene: THREE.Object3D): Rigging {
  const cached = scene.userData.rigging as Rigging | undefined
  if (cached) {
    for (const b of Object.values(cached.bones)) {
      const info = b && cached.rest.get(b.uuid)
      if (b && info) b.quaternion.copy(info.local)
    }
    scene.updateWorldMatrix(true, true)
    return cached
  }

  scene.updateWorldMatrix(true, true)
  const sceneInvQ = scene.getWorldQuaternion(new THREE.Quaternion()).invert()
  const bones: Rigging['bones'] = {}
  const rest = new Map<string, RestInfo>()

  scene.traverse((obj) => {
    for (const [key, name] of Object.entries(BONE_NAMES) as [BoneKey, string][]) {
      if (!bones[key] && obj.name === name && (obj as THREE.Bone).isBone) bones[key] = obj
    }
  })
  for (const b of Object.values(bones)) {
    if (!b) continue
    const world = sceneInvQ.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()))
    const parentWorld = b.parent
      ? sceneInvQ.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion()))
      : new THREE.Quaternion()
    const pos = scene.worldToLocal(b.getWorldPosition(new THREE.Vector3()))
    rest.set(b.uuid, { local: b.quaternion.clone(), world, parentWorld, pos })
  }

  const rig = { bones, rest }
  scene.userData.rigging = rig
  return rig
}

type GestureKind = 'nod' | 'waveL' | 'waveR'

/** 渐进加载：先挂 4 万面的小样（几百 KB，先有人），全尺寸在后台下完再换。
    两个模型的骨骼/尺度/静止姿势一致，替换时不会跳。 */
function ProgressiveAvatar(props: {
  reducedMotion: boolean
  pointer: React.RefObject<Pointer>
  drag: React.RefObject<DragState>
}) {
  const [full, setFull] = useState(false)
  // 给 ?stats=1 的角标看：现在画的是小样还是全尺寸
  useEffect(() => {
    document.documentElement.dataset.avatarModel = full ? 'full' : 'lite'
  }, [full])
  return (
    <>
      {!full && <GltfAvatar url={MODEL.lite} {...props} />}
      <Suspense fallback={null}>
        <LoadFull onReady={() => setFull(true)} />
      </Suspense>
      {full && <GltfAvatar url={MODEL.url} {...props} />}
    </>
  )
}

/** 只负责把全尺寸模型下载+解析完，然后通知父组件替换。自己不画任何东西。 */
function LoadFull({ onReady }: { onReady: () => void }) {
  useAvatarGLTF(MODEL.url) // 解析完成前会挂起（下载进度交给浏览器）
  useEffect(() => {
    onReady()
  }, [onReady])
  return null
}

function GltfAvatar({
  url,
  reducedMotion,
  pointer,
  drag,
}: {
  url: string
  reducedMotion: boolean
  pointer: React.RefObject<Pointer>
  drag: React.RefObject<DragState>
}) {
  const scene = useAvatarGLTF(url)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const [fit, setFit] = useState<{ scale: number; offset: [number, number, number] } | null>(null)
  const rig = useRef<Rigging | null>(null)
  const fitScale = useRef(1)
  const proxies = useRef<THREE.Mesh[]>([])
  const aimYaw = useRef(0)
  const aimPitch = useRef(-HEAD_LIFT)
  const gest = useRef<{ kind: GestureKind | null; t: number; cur: GestureKind | null }>({
    kind: null,
    t: 0,
    cur: null,
  })
  const hoverRay = useRef(new THREE.Raycaster())
  // 每帧复用的模型空间转动量
  const deltas = useRef({
    spine1: new THREE.Quaternion(),
    spine2: new THREE.Quaternion(),
    neck: new THREE.Quaternion(),
    head: new THREE.Quaternion(),
    shoulderL: new THREE.Quaternion(),
    shoulderR: new THREE.Quaternion(),
    armL: new THREE.Quaternion(),
    armR: new THREE.Quaternion(),
    foreArmL: new THREE.Quaternion(),
    foreArmR: new THREE.Quaternion(),
  })

  // 归一化：量出真实包围盒，缩放到 AVATAR_HEIGHT，并把身体中心移到世界原点。
  // 带蒙皮的模型必须用 SkinnedMesh.computeBoundingBox()（它会应用骨骼变换）。
  useLayoutEffect(() => {
    rig.current = captureRig(scene)
    applyAvatarShading(scene) // 眼球的虹膜/高光 + 发丝凹凸，所有材质共用一个着色器程序

    const box = new THREE.Box3()
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || mesh.userData.hoverProxy) return
      // 自身投影 + 接收（主光的阴影贴图）：没有这块，头发/下巴/腋下都没有暗部，看着像贴纸
      mesh.castShadow = true
      mesh.receiveShadow = true
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined
      if (mat && !Array.isArray(mat)) {
        // 眼镜框是闭合实体：双面渲染时镜框内表面会从脸里透出来，在镜片内缘形成锯齿状的暗边
        if (mat.name === 'glasses') mat.side = THREE.FrontSide
        // 镜框贴着颧骨，它投在脸上的细影在阴影贴图里必然锯齿化（表现为"撕纸边"），干脆不投
        if (mat.name === 'glasses') mesh.castShadow = false
      }
      const sk = mesh as THREE.SkinnedMesh
      if (sk.isSkinnedMesh) {
        sk.computeBoundingBox()
        if (sk.boundingBox) box.union(sk.boundingBox.clone().applyMatrix4(mesh.matrixWorld))
      } else if (mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld))
      }
    })
    if (box.isEmpty()) return

    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    const scale = AVATAR_HEIGHT / size.y
    fitScale.current = scale
    setFit({ scale, offset: [-center.x * scale, -center.y * scale, -center.z * scale] })

    // ---- 悬停区：头、两只手各一个不可见圆球 ----
    // 挂在 scene 根节点上、固定在**绑定姿势**的位置，不跟着骨骼动。
    // 之前挂在骨骼上：一点头/一挥手，圆球就从光标下面移开再移回来，于是反复触发。
    // 现在光标停着不动就只触发一次，要移出去再移进来才会再触发。
    for (const p of proxies.current) p.parent?.remove(p)
    proxies.current = []
    const { bones, rest } = rig.current
    const u = 1 / scale // 世界单位 → 模型空间单位
    const addProxy = (kind: GestureKind, at: THREE.Vector3, radius: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial())
      m.visible = false // 射线检测传的是显式对象引用，不看 visible
      m.userData.hoverProxy = true
      m.userData.gesture = kind
      m.position.copy(at)
      m.scale.setScalar(radius * u)
      scene.add(m)
      proxies.current.push(m)
    }
    const head = bones.head && rest.get(bones.head.uuid)
    if (head) addProxy('nod', head.pos.clone().add(new THREE.Vector3(0, 0.12 * u, 0)), 0.19)
    for (const [kind, foreKey, handKey] of [
      ['waveL', 'foreArmL', 'handL'],
      ['waveR', 'foreArmR', 'handR'],
    ] as const) {
      const fore = bones[foreKey] && rest.get(bones[foreKey]!.uuid)
      const hand = bones[handKey] && rest.get(bones[handKey]!.uuid)
      if (!fore || !hand) continue
      // 手骨在手腕；可见的手沿前臂方向再往下一点
      const dir = hand.pos.clone().sub(fore.pos).normalize()
      addProxy(kind, hand.pos.clone().addScaledVector(dir, 0.05 * u), 0.13)
    }
  }, [scene])

  // 鼠标按在人物身上拖动 → 旋转看全身。只有真的点到模型才起拖。
  useEffect(() => {
    const el = gl.domElement
    const d = drag.current
    if (!d) return
    const rc = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let activeId = -1
    let lastX = 0
    let lastY = 0

    const onDown = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1))
      rc.setFromCamera(ndc, camera)
      const hits = rc.intersectObject(scene, true).filter((h) => !h.object.userData.hoverProxy)
      if (hits.length === 0) return
      d.active = true
      activeId = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      if (!d.active || e.pointerId !== activeId) return
      d.x += (e.clientX - lastX) * 0.011
      d.y = THREE.MathUtils.clamp(d.y + (e.clientY - lastY) * 0.007, -0.45, 0.8)
      lastX = e.clientX
      lastY = e.clientY
      invalidate()
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return
      d.active = false
      activeId = -1
      el.style.cursor = ''
      invalidate()
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [gl, camera, scene, drag, invalidate])

  // 减少动态效果：不跑动画，但头还是要抬起来（绑定姿势是低头的）
  useLayoutEffect(() => {
    if (!reducedMotion || !rig.current) return
    const { bones, rest } = rig.current
    const D = deltas.current
    driven.clear()
    drive(bones.neck, rest, yawPitch(D.neck, 0, -HEAD_LIFT * 0.4))
    drive(bones.head, rest, yawPitch(D.head, 0, -HEAD_LIFT))
    invalidate()
  }, [reducedMotion, fit, invalidate])

  useFrame((state, delta) => {
    if (reducedMotion || !rig.current) return
    const dt = Math.min(delta, 0.05)
    const t = state.clock.elapsedTime
    const { bones, rest } = rig.current
    const D = deltas.current
    const g = gest.current

    // ---- 悬停触发：进入某个区域时触发一次 ----
    hoverRay.current.setFromCamera(state.pointer, state.camera)
    const hit = drag.current?.active ? undefined : hoverRay.current.intersectObjects(proxies.current, false)[0]
    const target = (hit?.object.userData.gesture as GestureKind | undefined) ?? null
    if (!g.kind && target && target !== g.cur) {
      g.kind = target
      g.t = 0
    }
    g.cur = target
    if (g.kind) {
      g.t += dt
      if (g.t >= (g.kind === 'nod' ? NOD_DUR : WAVE_DUR)) g.kind = null
    }

    // ---- 头朝光标 ----
    const px = pointer.current?.x ?? 0
    const py = pointer.current?.y ?? 0
    aimYaw.current = THREE.MathUtils.damp(aimYaw.current, px * LOOK.yaw, 3.2, dt)
    // 正 pitch = 低头。光标在上（py<0）→ 抬头；在下 → 只微微低一点
    const pitchTarget = -HEAD_LIFT + (py < 0 ? py * LOOK.up : py * LOOK.down)
    aimPitch.current = THREE.MathUtils.damp(aimPitch.current, pitchTarget, 3.2, dt)

    let nod = 0
    if (g.kind === 'nod') {
      const s = Math.sin((Math.PI * (g.t % NOD_BEAT)) / NOD_BEAT)
      nod = NOD_AMP * s * s
    }
    const yaw = aimYaw.current + Math.sin(t * 0.42) * 0.04
    const pitch = aimPitch.current + Math.sin(t * 0.63) * 0.015 + nod
    const breathe = Math.sin(t * 1.15) * 0.012

    // 躯干 → 脖子 → 头。转动量都是"相对绑定姿势的总量"，父骨骼先驱动
    driven.clear()
    drive(bones.spine1, rest, yawPitch(D.spine1, yaw * 0.05, breathe * 0.6))
    drive(bones.spine2, rest, yawPitch(D.spine2, yaw * 0.11, breathe))
    drive(bones.neck, rest, yawPitch(D.neck, yaw * 0.45, pitch * NECK_SHARE))
    drive(bones.head, rest, yawPitch(D.head, yaw, pitch))

    // ---- 手臂：待机微摆 + 挥手 ----
    const waveW = g.kind === 'waveL' || g.kind === 'waveR' ? waveEnvelope(g.t) : 0
    const swing = Math.sin(g.t * WAVE_FREQ) * WAVE_SWING
    const idle = Math.sin(t * 0.85) * 0.02
    for (const side of [1, -1] as const) {
      const L = side > 0
      poseArm({
        side,
        w: (L ? g.kind === 'waveL' : g.kind === 'waveR') ? waveW : 0,
        swing,
        idle: idle * side,
        shoulder: bones[L ? 'shoulderL' : 'shoulderR'],
        arm: bones[L ? 'armL' : 'armR'],
        fore: bones[L ? 'foreArmL' : 'foreArmR'],
        hand: bones[L ? 'handL' : 'handR'],
        rest,
        dShoulder: L ? D.shoulderL : D.shoulderR,
        dArm: L ? D.armL : D.armR,
        dFore: L ? D.foreArmL : D.foreArmR,
      })
    }
  })

  if (!fit) return <primitive object={scene} />
  return (
    <group scale={fit.scale} position={fit.offset}>
      <primitive object={scene} />
    </group>
  )
}

/** 挥手的时间包络：0.35s 抬起 → 保持挥动 → 0.45s 放下 */
function waveEnvelope(t: number) {
  const rise = 0.35
  const fall = 0.45
  const k = t < rise ? t / rise : t > WAVE_DUR - fall ? Math.max(0, (WAVE_DUR - t) / fall) : 1
  return k * k * (3 - 2 * k) // smoothstep，起落不生硬
}

/** 摆手臂。不猜骨骼的局部轴：直接算"上臂/前臂当前指向 → 目标指向"的最小旋转。
    肩骨分担 25% 的抬升，减轻腋下网格被拉扯。 */
function poseArm(o: {
  side: 1 | -1
  w: number
  swing: number
  idle: number
  shoulder?: THREE.Object3D
  arm?: THREE.Object3D
  fore?: THREE.Object3D
  hand?: THREE.Object3D
  rest: Map<string, RestInfo>
  dShoulder: THREE.Quaternion
  dArm: THREE.Quaternion
  dFore: THREE.Quaternion
}) {
  const ar = o.arm && o.rest.get(o.arm.uuid)
  const fo = o.fore && o.rest.get(o.fore.uuid)
  const hn = o.hand && o.rest.get(o.hand.uuid)
  if (!o.arm || !ar || !o.fore || !fo) return
  // 躯干（呼吸、轻微转身）带来的转动，手臂要跟着
  const body = parentDeltaOf(o.shoulder ?? o.arm)

  // 上臂：绑定姿势的指向 → 目标指向（最小旋转，不依赖骨骼局部轴）
  const upperRest = _v.copy(fo.pos).sub(ar.pos).normalize()
  const upperTarget = _v2.copy(WAVE_UPPER).setX(WAVE_UPPER.x * o.side)
  const full = new THREE.Quaternion().setFromUnitVectors(upperRest, upperTarget)
  const idleQ = new THREE.Quaternion().setFromAxisAngle(AZ, o.idle)

  // 肩骨分担一部分抬升，减轻腋下网格被拉扯
  if (o.shoulder) drive(o.shoulder, o.rest, o.dShoulder.copy(body).multiply(_qb.copy(ID).slerp(full, SHOULDER_SHARE * o.w)))
  drive(o.arm, o.rest, o.dArm.copy(body).multiply(_qb.copy(ID).slerp(full, o.w)).multiply(idleQ))

  // 前臂：上臂转完后它的指向 → 竖直向上，再绕"朝镜头"的轴左右摆
  if (!hn) return
  const foreNow = new THREE.Vector3().copy(hn.pos).sub(fo.pos).normalize().applyQuaternion(o.dArm)
  const foreTarget = new THREE.Vector3()
    .copy(WAVE_FORE)
    .setX(WAVE_FORE.x * o.side)
    .applyAxisAngle(AZ, -o.swing * o.side)
  const bend = new THREE.Quaternion().setFromUnitVectors(foreNow, foreTarget)
  drive(o.fore, o.rest, o.dFore.copy(ID).slerp(bend, o.w).multiply(o.dArm))
}
