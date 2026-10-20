// 设备能力检测：决定显示 3D 还是静态图，是否开启动效。

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** 粗略判断低端设备：CPU 核数少、内存小或开启了省流量。 */
export function isLowEndDevice(): boolean {
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean }
  }
  if (nav.connection?.saveData) return true
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return true
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency < 4) return true
  return false
}

export function canRender3D(): boolean {
  return supportsWebGL() && !isLowEndDevice()
}

/** 网络慢到不值得为 3D 付 ~1.9 MB 时返回 true（2G/3G、省流量模式）。
    这种情况直接显示静态渲染图（public/avatar-portrait.webp，从画布导出的同一套打光），
    首屏要传的字节从约 1.9 MB 降到 66 KB。 */
export function slowNetwork(): boolean {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection
  if (!connection) return false
  if (connection.saveData) return true
  const et = connection.effectiveType
  return et === 'slow-2g' || et === '2g' || et === '3g'
}


/** 显卡档次，用来决定**一开始**就用哪一档画质。
    之前是统一从中间档起步、再靠帧率往上爬，用户实际能看到"先糊 → 变清晰 → 阴影冒出来"
    的跳变（他说模型"一点点加载出来"）。现在按显卡型号直接给起始档：能跑的一上来就满档，
    弱机一上来就省电档，只在实测掉帧时往下退。 */
export type GpuTier = 'fast' | 'ok' | 'slow' | 'unknown'

let tierCache: GpuTier | null = null

export function gpuTier(): GpuTier {
  if (tierCache) return tierCache
  tierCache = (() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
      if (!gl) return 'slow'
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
      // 用完立刻释放，别占着 GPU 上下文配额
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      const s = name.toLowerCase()
      if (!s) return 'unknown'
      if (/swiftshader|basic render|llvmpipe|software|microsoft basic/.test(s)) return 'slow'
      if (/nvidia|geforce|radeon rx|radeon pro|rtx|apple m\d|arc a\d/.test(s)) return 'fast'
      if (/intel|uhd|iris|radeon graphics|adreno|mali|powervr|apple gpu/.test(s)) return 'ok'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  })()
  return tierCache
}

