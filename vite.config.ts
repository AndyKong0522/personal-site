import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** 只在首屏真的会自动加载 3D 时才预载模型和 three.js 包（约 1.2 MB + 270 KB gzip）。
    判断条件和 src/capabilities.ts 的 hero3DMode() 保持一致：省流量、慢网、低内存/少核、
    网络估计偏慢且没点过"让我动起来"、或 ?static —— 这些访客只看静图，不该白下两兆多。
    之前是无条件预载，低端手机和省流量模式也照下不误。 */
const preloadScript = (model: string, scene: string) =>
  `(function(){try{var n=navigator,c=n.connection||{},q=location.search;` +
  `if(/[?&]static\\b/.test(q))return;` +
  `if(!/[?&]force3d\\b/.test(q)){` +
  `if(c.saveData||c.effectiveType==='slow-2g')return;` +
  `if(n.deviceMemory!==undefined&&n.deviceMemory<4)return;` +
  `if(n.hardwareConcurrency!==undefined&&n.hardwareConcurrency<4)return;` +
  `var s=false;try{s=localStorage.getItem('avatar-3d')==='1'}catch(e){}` +
  `if(!s&&(typeof c.rtt==='number'||typeof c.downlink==='number')&&!((c.rtt||0)<=300&&(c.downlink==null?99:c.downlink)>=1.5))return}` +
  `var h=document.head,a=document.createElement('link');a.rel='preload';a.as='fetch';a.href='/${model}';a.crossOrigin='anonymous';h.appendChild(a);` +
  `var b=document.createElement('link');b.rel='modulepreload';b.href='/${scene}';h.appendChild(b)}catch(e){}})()`

let inlineHash = ''

/** 把 3D 模型的预载 <link> 直接写进 index.html。
    在 JS 里插要等主包下载并执行完（几百毫秒之后），写在 HTML 里浏览器一解析到就开始下载，
    和主包并行。模型文件名带内容哈希，所以从构建产物里找。
    必须带 crossorigin：模型的加载走 fetch（见 src/three/useAvatarGLTF.ts），
    预载不带 crossorigin 时请求模式对不上，同一个文件会被下载两次（实测过）。 */
function preloadAvatarModel(): Plugin {
  return {
    name: 'preload-avatar-model',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle ?? {}
        const model = Object.keys(bundle).find((f) => /^assets\/avatar-[^/]+\.glb$/.test(f))
        // three.js 那个包是动态 import 的，浏览器要等主页执行到那一步才发请求。
        // 慢网实测：主页 1.5s 下完、再过一会儿才轮到它，两段下载完全串行。
        // 反正一定会用到，提前 modulepreload 让它们并行。
        const scene = Object.keys(bundle).find((f) => /^assets\/AvatarScene-[^/]+\.js$/.test(f))
        // 内联脚本受 CSP 管：算出它的 sha256，构建结束时写进 dist/_headers 的 script-src
        const script = model && scene ? preloadScript(model, scene) : ''
        inlineHash = script ? createHash('sha256').update(script).digest('base64') : ''
        const tags = [
          // 静图是首帧的占位图（3D 淡入前的 0.6 秒都是它），慢网下它就是主角，最早拿到最好
          '<link rel="preload" as="image" href="/avatar-portrait.webp" fetchpriority="high">',
          script ? `<script>${script}</script>` : '',
        ]
          .filter(Boolean)
          .join('\n    ')
        return html.replace('</head>', `    ${tags}\n  </head>`)
      },
    },
    async closeBundle() {
      if (!inlineHash) return
      const file = resolve(process.cwd(), 'dist', '_headers')
      const text = await readFile(file, 'utf8')
      const next = text.replace("script-src 'self'", `script-src 'self' 'sha256-${inlineHash}'`)
      if (next === text) throw new Error('_headers: script-src not found, inline preload would be blocked by CSP')
      await writeFile(file, next)
    },
  }
}

export default defineConfig({
  plugins: [react(), preloadAvatarModel()],
  // three.js 那个包（约 1000 KB，gzip 约 270 KB）是首屏渲染后才懒加载的，不阻塞首屏。
  build: { chunkSizeWarningLimit: 1000 },
})
