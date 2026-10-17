#!/usr/bin/env node
/**
 * TokenHub Seedream 生图工具（参考生图）
 *
 * 接口：POST https://tokenhub.tencentmaas.com/v1/wand/si-image/generation
 * 鉴权：Authorization: Bearer <TOKENHUB_API_KEY>（从 .env 读取）
 *
 * 用法：
 *   node tools/seedream.mjs <A|B> [--model seedream-image-v5.0-pro] [--ref photos/xxx.jpg] [--n 1]
 *
 * 输出到 .tmp-tools/art/
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { AVATAR_PROMPTS } from './prompts.mjs'

const ENDPOINT = 'https://tokenhub.tencentmaas.com/v1/wand/si-image/generation'
const OUT = '.tmp-tools/art'

const args = process.argv.slice(2)
const variant = args[0] ?? 'A'
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const model = opt('model', 'seedream-image-v5.0-pro')
const ref = opt('ref', 'photos/微信图片_20261016144825_40_2.jpg')
const n = Number(opt('n', '1'))

const env = await readFile('.env', 'utf8')
const key = env
  .split(/\r?\n/)
  .find((l) => l.startsWith('TOKENHUB_API_KEY='))
  ?.slice('TOKENHUB_API_KEY='.length)
  .trim()
if (!key) throw new Error('.env 缺 TOKENHUB_API_KEY')

const prompt = AVATAR_PROMPTS[variant]
if (!prompt) throw new Error(`未知版本 ${variant}`)
console.log(`模型 ${model}  版本 ${variant}  提示词 ${prompt.length} 字`)

const img = await readFile(ref)
const dataUri = `data:image/jpeg;base64,${img.toString('base64')}`

await mkdir(OUT, { recursive: true })

for (let i = 1; i <= n; i++) {
  const t0 = Date.now()
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, images: [dataUri], size: '2K', output_format: 'png' }),
  })
  const text = await res.text()
  const sec = ((Date.now() - t0) / 1000).toFixed(1)
  if (!res.ok) {
    let msg = text.slice(0, 400)
    try {
      const e = JSON.parse(text).error
      msg = `${e.code} ${e.message_zh ?? e.message}`
    } catch {}
    console.log(`✗ 第 ${i} 张  HTTP ${res.status}  ${msg}`)
    process.exitCode = 1
    break
  }
  const json = JSON.parse(text)
  const items = json.data ?? json.images ?? []
  if (!items.length) {
    console.log(`? 第 ${i} 张  成功但没有图片字段：`, text.slice(0, 600))
    break
  }
  for (const [k, item] of items.entries()) {
    const dest = join(OUT, `${variant}-${model}-${i}${items.length > 1 ? `-${k + 1}` : ''}.png`)
    if (item.b64_json) await writeFile(dest, Buffer.from(item.b64_json, 'base64'))
    else if (item.url) {
      const r = await fetch(item.url)
      await writeFile(dest, Buffer.from(await r.arrayBuffer()))
    } else {
      console.log('? 条目字段：', Object.keys(item))
      continue
    }
    console.log(`✓ ${dest}  (${sec}s)`)
  }
  if (json.usage) console.log('  用量：', JSON.stringify(json.usage))
}
