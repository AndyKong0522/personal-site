// 3D 模型文件走 Vite 的资源导入（而不是 public/）：
// 导入后文件名带内容哈希，命中 public/_headers 里 /assets/* 的 immutable 缓存；
// 之前放在 public/models 下文件名不变、缓存 1 天，换模型后回访者会继续看旧文件。
import full from './assets/models/avatar.glb?url'
import lite from './assets/models/avatar-lite.glb?url'

/** full = 10 万面全尺寸；lite = 4 万面小样，先渲染它，全尺寸下完再替换 */
export const AVATAR_MODEL = { full, lite }
