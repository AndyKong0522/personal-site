import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
        const tags = [
          // 静图是首帧的占位图（3D 淡入前的 0.6 秒都是它），慢网下它就是主角，最早拿到最好
          '<link rel="preload" as="image" href="/avatar-portrait.webp" fetchpriority="high">',
          model ? `<link rel="preload" as="fetch" href="/${model}" crossorigin="anonymous">` : '',
          scene ? `<link rel="modulepreload" href="/${scene}">` : '',
        ]
          .filter(Boolean)
          .join('\n    ')
        return html.replace('</head>', `    ${tags}\n  </head>`)
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), preloadAvatarModel()],
  // three.js 那个包（约 1000 KB，gzip 约 270 KB）是首屏渲染后才懒加载的，不阻塞首屏。
  build: { chunkSizeWarningLimit: 1000 },
})
