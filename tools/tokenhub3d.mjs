#!/usr/bin/env node
/**
 * TokenHub 3D 服务通用工具（绑骨 / 文生动作 / UV 展开 / 智能拓扑 …）
 *
 * 统一接入点：POST https://tokenhub.tencentmaas.com/v1/api/3d/submit
 *              POST https://tokenhub.tencentmaas.com/v1/api/3d/query
 * 鉴权：Authorization: Bearer <TOKENHUB_API_KEY>   ← 必须带 Bearer
 * 用 model 字段区分具体服务，例如 hy-3d-rigging、hy-3d-motion、hy-3d-uv
 *
 * 注意：file_3d 只接受**公网可访问的 URL**，不支持 base64，
 *       也没有独立的上传接口。混元生3D 的输出地址（腾讯云 COS 签名 URL，24 小时有效）
 *       可以直接拿来用——`node tools/ai3d.mjs query <JobId>` 可以重新取到。
 *
 * 用法：
 *   node tools/tokenhub3d.mjs submit <model> --url <文件URL> [--motion-type N] [--prompt "..."]
 *   node tools/tokenhub3d.mjs query  <model> <id>
 *   node tools/tokenhub3d.mjs wait   <model> <id> [--outdir .tmp-tools/out3d]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'https://tokenhub.tencentmaas.com/v1/api/3d'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function loadKey() {
  const env = await readFile('.env', 'utf8')
  const line = env.split(/\r?\n/).find((l) => l.startsWith('TOKENHUB_API_KEY='))
  if (!line) throw new Error('.env 里没有 TOKENHUB_API_KEY')
  return line.slice('TOKENHUB_API_KEY='.length).trim()
}

async function call(path, body, key) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`返回不是 JSON（HTTP ${res.status}）：${text.slice(0, 300)}`)
  }
  if (json.error && json.status !== 'failed') throw new Error(`${json.error.code}：${json.error.message}`)
  if (json.Code) throw new Error(`${json.Code}：${json.Msg}`)
  if (json.status === 'failed') throw new Error(`任务失败：${json.error?.message ?? text.slice(0, 200)}`)
  return json
}

function parseArgs(argv) {
  const opts = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url') opts.url = argv[++i]
    else if (a === '--field') opts.field = argv[++i]
    else if (a === '--format') opts.format = argv[++i]
    else if (a === '--motion-type') opts.motionType = Number(argv[++i])
    else if (a === '--prompt') opts.prompt = argv[++i]
    else if (a === '--duration') opts.duration = Number(argv[++i])
    else if (a === '--outdir') opts.outdir = argv[++i]
    else positional.push(a)
  }
  return { opts, positional }
}

async function cmdSubmit([model], opts, key) {
  if (!model) throw new Error('用法：submit <model> --url <文件URL> [--motion-type N]')
  const body = { model }

  // 各服务要求的字段名不同：绑骨/动作用 file_3d，格式转换用 file
  const field = opts.field ?? 'file_3d'
  if (opts.url) body[field] = { url: opts.url }
  if (opts.format) body.format = opts.format
  if (opts.motionType != null) body.motion_type = opts.motionType
  if (opts.prompt) body.prompt = opts.prompt
  if (opts.duration != null) body.duration = opts.duration

  const r = await call('/submit', body, key)
  console.log(`id：${r.id}   status：${r.status}`)
  return r.id
}

async function cmdQuery([model, id], _opts, key) {
  const r = await call('/query', { model, id }, key)
  console.log(JSON.stringify(r, null, 2))
  return r
}

/** 宽松地从返回体里挖出所有文件地址 */
function extractUrls(resp) {
  const found = []
  const walk = (v) => {
    if (v == null) return
    if (typeof v === 'string') {
      if (/^https?:\/\/\S+\.(glb|fbx|obj|zip|png|jpg|usdz)(\?\S*)?$/i.test(v)) found.push(v)
      return
    }
    if (Array.isArray(v)) return v.forEach(walk)
    if (typeof v === 'object') return Object.values(v).forEach(walk)
  }
  walk(resp)
  return [...new Set(found)]
}

async function cmdWait([model, id], opts, key) {
  if (!model || !id) throw new Error('用法：wait <model> <id>')
  for (let i = 0; i < 180; i++) {
    const r = await call('/query', { model, id }, key)
    process.stdout.write(`\r[${i * 5}s] status=${r.status}      `)
    if (r.status === 'completed' || r.status === 'failed') {
      console.log('')
      console.log(JSON.stringify(r, null, 2).slice(0, 1500))
      if (r.status === 'failed') throw new Error('任务失败')

      const urls = extractUrls(r)
      if (!urls.length) {
        console.log('⚠️  没找到文件地址')
        return r
      }
      const outdir = opts.outdir ?? '.'
      await mkdir(outdir, { recursive: true })
      for (const u of urls) {
        const name = decodeURIComponent(u.split('?')[0].split('/').pop())
        const res = await fetch(u)
        if (!res.ok) {
          console.log(`✗ ${name} HTTP ${res.status}`)
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const dest = join(outdir, name)
        await writeFile(dest, buf)
        console.log(`✓ ${dest}  ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
      }
      return r
    }
    await sleep(5000)
  }
  throw new Error('等待超时')
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const { opts, positional } = parseArgs(rest)
  const key = await loadKey()

  if (cmd === 'submit') return void (await cmdSubmit(positional, opts, key))
  if (cmd === 'query') return void (await cmdQuery(positional, opts, key))
  if (cmd === 'wait') return void (await cmdWait(positional, opts, key))

  console.log(`未知命令：${cmd ?? '(空)'}

用法：
  node tools/tokenhub3d.mjs submit <model> --url <文件URL> [--motion-type N]
  node tools/tokenhub3d.mjs query  <model> <id>
  node tools/tokenhub3d.mjs wait   <model> <id> [--outdir dir]`)
  process.exitCode = 1
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`)
  process.exitCode = 1
})
