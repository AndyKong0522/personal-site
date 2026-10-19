// 模型加载：直接用 three 自带的 GLTFLoader + Meshopt 解码器，不用 drei。
//
// 为什么不用 drei 的 useGLTF：它会把 three-stdlib 的 GLTFLoader、DRACOLoader、KTX2Loader
// 一起打进这个按需加载的包里，而这个站点只用到 meshopt 一种压缩，多出来的几十 KB
// 对"打开网页要等一下"这件事是白付的。这里换成 three/examples 里的同一份 loader。
//
// Suspense 语义照旧：加载完成前抛 promise，交给上层的 <Suspense> 显示 fallback。

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type * as THREE from 'three'

type Entry = { promise: Promise<void>; scene?: THREE.Group; error?: unknown }

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
const cache = new Map<string, Entry>()

function entryFor(url: string): Entry {
  let e = cache.get(url)
  if (!e) {
    const created: Entry = { promise: Promise.resolve() }
    created.promise = loader
      .loadAsync(url)
      .then((gltf) => {
        created.scene = gltf.scene
      })
      .catch((err) => {
        created.error = err // 存起来，下一次渲染时抛出去（不让 Suspense 无限重试）
      })
    e = created
    cache.set(url, e)
  }
  return e
}

/** 拿模型；没加载完就抛 promise 挂起。 */
export function useAvatarGLTF(url: string): THREE.Group {
  const e = entryFor(url)
  if (e.error) throw e.error
  if (!e.scene) throw e.promise
  return e.scene
}

/** 后台先把模型下下来（不挂起），稍后再用。返回的 promise 结束即可切换。 */
export function preloadAvatarGLTF(url: string): Promise<void> {
  return entryFor(url).promise
}
