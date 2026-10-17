# gonghuipeng.com

拱慧鹏的个人网站 · 作品集与联系方式。

**线上：** https://gonghuipeng.com

中英双语，单页。首屏是一个可以互动的 3D 卡通形象——它会跟着鼠标转头、眨眼式的微动、
鼠标移到头上会点头、移到手上会挥手，按住还能拖动旋转看全身。

---

## 技术栈

| 用途 | 选择 | 说明 |
|---|---|---|
| 构建 | Vite 8 + TypeScript | |
| 页面 | React 19 | |
| 3D | three.js + React Three Fiber + drei | 懒加载，不阻塞首屏 |
| 滚动动效 | GSAP ScrollTrigger + Lenis | 尊重 `prefers-reduced-motion` |
| 部署 | Cloudflare Pages | |

运行时**不请求任何外部服务**：字体自托管，没有 CDN、没有分析脚本、没有第三方请求。

## 本地运行

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 输出到 dist/
npm run preview  # 预览构建产物
```

Node 版本见 `.nvmrc`（22）。

## 目录结构

```
src/
  content.ts            中英文案与事实性内容（改文字只改这里）
  App.tsx               页面结构、滚动动效、分段指示
  capabilities.ts       WebGL / 低端设备 / 减少动态效果检测
  three/AvatarScene.tsx 3D 场景与程序化骨骼动画
  styles.css
public/
  models/avatar.glb     3D 形象（4.55 MB，带 28 根骨骼）
  _headers              Cloudflare Pages 响应头（缓存 + CSP）
  og.png                社交分享预览图
tools/                  形象生成流程用到的脚本（从 .env 读密钥，不入库）
archive/models/         形象早期版本，仅留档，不部署
```

## 3D 形象是怎么来的

照片 → AI 生成卡通全身图 → 图生 3D → 自动绑骨 → 压缩成 GLB → 浏览器里用代码驱动骨骼。

模型服务返回的动作重定向效果很差（会把网格扭变形），所以动画是**在代码里逐根骨骼驱动**的：
头部跟随光标、呼吸、悬停手势，全部按"模型空间的方向"换算成骨骼局部旋转，
不依赖骨骼自身的坐标轴。完整过程、踩过的坑和可复用命令都记在 [`AVATAR.md`](AVATAR.md)。

## 无障碍与性能

- 支持 `prefers-reduced-motion`：关闭视差与自动动画，只保留静态姿态
- WebGL 不可用或设备过弱时，回落到静态占位图
- 3D 场景单独打包、首屏渲染完再懒加载
- 文字对比度：正文约 5.8:1，标题约 15:1
- 有 CSP、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 等响应头

## 部署

推送到 `main` 分支后由 Cloudflare Pages 自动构建：

- 构建命令 `npm run build`，输出目录 `dist`
- 环境变量 `NODE_VERSION=22`
- 自定义域名 `gonghuipeng.com`，`www` 301 跳转到主域

## 许可

页面内容与个人形象版权所有，请勿转载。代码部分可作参考。
