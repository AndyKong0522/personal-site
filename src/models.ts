// 3D 模型文件走 Vite 的资源导入（而不是 public/）：
// 导入后文件名带内容哈希，命中 public/_headers 里 /assets/* 的 immutable 缓存；
// 之前放在 public/models 下文件名不变、缓存 1 天，换模型后回访者会继续看旧文件。
//
// 曾经试过"先挂低模小样、后台再换全尺寸"的两段式加载，放弃了：
// 这套模型减到 2.5 万面时，只有 1000 面的眼球会被减面整个抹掉，没眼睛的占位比插画占位更糟。
import full from './assets/models/avatar.glb?url'

export const AVATAR_MODEL = { full }
