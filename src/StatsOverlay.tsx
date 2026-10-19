// 运行时状态角标。只在 URL 带 ?stats=1 时显示，正常用户看不到。
// 用来在不猜的情况下定位"卡"：帧率、实际渲染分辨率、GPU、画布尺寸、是否已降级。

import { useEffect, useState } from 'react'

type Info = {
  fps: number
  slow: number
  dpr: number
  cssW: number
  cssH: number
  gpu: string
  shadows: string
  model: string
}

export default function StatsOverlay() {
  const [info, setInfo] = useState<Info | null>(null)
  const [on, setOn] = useState(false)

  useEffect(() => {
    setOn(new URLSearchParams(location.search).has('stats'))
  }, [])

  useEffect(() => {
    if (!on) return
    const frames: number[] = []
    let raf = 0
    let last = performance.now()
    let t = 0

    const tick = () => {
      const now = performance.now()
      frames.push(now - last)
      last = now
      if (frames.length > 90) frames.shift()
      if (now - t > 400) {
        t = now
        const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
        const sorted = [...frames].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)] || 0
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0
        let gpu = 'n/a'
        try {
          const gl = canvas?.getContext('webgl2')
          const ext = gl?.getExtension('WEBGL_debug_renderer_info')
          if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
        } catch {
          /* 老浏览器没有这个扩展 */
        }
        const rect = canvas?.getBoundingClientRect()
        setInfo({
          fps: median > 0 ? Math.round(1000 / median) : 0,
          slow: Math.round(p95),
          dpr: canvas && rect ? +(canvas.width / rect.width).toFixed(2) : 0,
          cssW: rect ? Math.round(rect.width) : 0,
          cssH: rect ? Math.round(rect.height) : 0,
          gpu,
          shadows: document.documentElement.dataset.avatarShadows ?? '?',
          model: document.documentElement.dataset.avatarModel ?? '?',
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [on])

  if (!on || !info) return null
  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 99,
        font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        background: 'rgba(20,20,20,0.86)',
        color: '#eaeaea',
        padding: '8px 10px',
        borderRadius: 6,
        pointerEvents: 'none',
        maxWidth: 460,
        whiteSpace: 'pre-wrap',
      }}
    >
      {`${info.fps} fps  (p95 ${info.slow}ms)\n`}
      {`渲染分辨率 ×${info.dpr}  ·  画布 ${info.cssW}×${info.cssH} CSS\n`}
      {`阴影 ${info.shadows === '1' ? '开' : '关'}  ·  模型 ${info.model}\n`}
      {`GPU ${info.gpu}`}
    </div>
  )
}
