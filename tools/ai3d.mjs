#!/usr/bin/env node
/**
 * 腾讯混元生3D（OpenAI 兼容接口）命令行工具
 *
 * 接入点：https://api.ai3d.cloud.tencent.com/v1/ai3d
 * 鉴权：请求头 Authorization 直接放 sk- 开头的 API Key（加不加 Bearer 都行）
 *
 * 用法：
 *   node tools/ai3d.mjs submit <图片路径> [--normal|--lowpoly|--geometry] [--facecount N] [--pbr]
 *   node tools/ai3d.mjs query <JobId>
 *   node tools/ai3d.mjs wait  <JobId> [--outdir public/models]
 *
 * Key 从项目根目录 .env 的 API_KEY 读取（该文件已在 .gitignore 中）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

const BASE = 'https://api.ai3d.cloud.tencent.com/v1/ai3d'
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function loadKey() {
  const env = await readFile('.env', 'utf8').catch(() => {
    throw new Error('读不到 .env，请在项目根目录创建并写入 API_KEY=sk-...')
  })
  const line = env.split(/\r?\n/).find((l) => l.startsWith('API_KEY='))
  if (!line) throw new Error('.env 里没有 API_KEY=')
  return line.slice('API_KEY='.length).trim()
}

/** 统一发请求；HTTP 非 2xx 或响应体里带 Error 都抛出来 */
async function call(path, body, key) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`返回不是 JSON（HTTP ${res.status}）：${text.slice(0, 300)}`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}：${text.slice(0, 300)}`)
  if (json.Response?.Error) {
    const e = json.Response.Error
    throw new Error(`${e.Code}：${e.Message}（RequestId ${json.Response.RequestId}）`)
  }
  return json.Response
}

function parseArgs(argv) {
  const opts = { generateType: 'Normal', faceCount: null, pbr: false, outdir: null }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--lowpoly') opts.generateType = 'LowPoly'
    else if (a === '--geometry') opts.generateType = 'Geometry'
    else if (a === '--normal') opts.generateType = 'Normal'
    else if (a === '--pbr') opts.pbr = true
    else if (a === '--facecount') opts.faceCount = Number(argv[++i])
    else if (a === '--outdir') opts.outdir = argv[++i]
    else positional.push(a)
  }
  return { opts, positional }
}

async function cmdSubmit([imgPath], opts, key) {
  if (!imgPath) throw new Error('用法：submit <图片路径>')
  const ext = extname(imgPath).toLowerCase()
  if (!MIME[ext]) throw new Error(`不支持的图片格式 ${ext}（支持 jpg / png / webp）`)

  const buf = await readFile(imgPath)
  const b64 = buf.toString('base64')
  const sizeMB = (b64.length / 1024 / 1024).toFixed(2)
  console.log(`图片：${basename(imgPath)}  ${(buf.length / 1024).toFixed(0)} KB  base64 后 ${sizeMB} MB`)
  if (b64.length > 6 * 1024 * 1024) throw new Error('base64 后超过 6 MB 上限，请先压缩图片')

  const body = { ImageBase64: `data:${MIME[ext]};base64,${b64}` }
  if (opts.generateType !== 'Normal') body.GenerateType = opts.generateType
  if (opts.faceCount) body.FaceCount = opts.faceCount
  if (opts.pbr) body.EnablePBR = true

  const r = await call('/submit', body, key)
  console.log(`JobId：${r.JobId}`)
  return r.JobId
}

async function cmdQuery([jobId], _opts, key) {
  if (!jobId) throw new Error('用法：query <JobId>')
  const r = await call('/query', { JobId: jobId }, key)
  console.log(JSON.stringify(r, null, 2))
  return r
}

async function cmdWait([jobId], opts, key) {
  if (!jobId) throw new Error('用法：wait <JobId>')
  for (let i = 0; i < 120; i++) {
    const r = await call('/query', { JobId: jobId }, key)
    const status = r.Status ?? r.JobStatusCode ?? '未知'
    process.stdout.write(`\r[${i * 5}s] 状态：${status}          `)
    if (status === 'DONE' || status === 'FAIL') {
      console.log('')
      if (status === 'FAIL') {
        console.log(JSON.stringify(r, null, 2))
        throw new Error('任务失败')
      }
      return r
    }
    await sleep(5000)
  }
  throw new Error('等待超时')
}

/** 从返回体里挖出所有文件下载地址（字段名在不同版本里不一样，所以宽松匹配） */
function extractFiles(resp) {
  const found = []
  const walk = (v, path = '') => {
    if (v == null) return
    if (typeof v === 'string') {
      if (/^https?:\/\/\S+\.(glb|obj|fbx|stl|usdz|zip|mtl|jpg|png)(\?\S*)?$/i.test(v)) {
        found.push({ url: v, path })
      }
      return
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`))
    if (typeof v === 'object') return Object.entries(v).forEach(([k, x]) => walk(x, path ? `${path}.${k}` : k))
  }
  walk(resp)
  return found
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const { opts, positional } = parseArgs(rest)
  const key = await loadKey()

  if (cmd === 'submit') return void (await cmdSubmit(positional, opts, key))
  if (cmd === 'query') return void (await cmdQuery(positional, opts, key))

  if (cmd === 'wait') {
    const resp = await cmdWait(positional, opts, key)
    console.log(JSON.stringify(resp, null, 2))

    const files = extractFiles(resp)
    if (!files.length) {
      console.log('⚠️  没在返回体里找到文件地址，请人工看上面的 JSON')
      return
    }
    const outdir = opts.outdir ?? '.'
    await mkdir(outdir, { recursive: true })
    for (const f of files) {
      const name = decodeURIComponent(f.url.split('?')[0].split('/').pop())
      const dest = join(outdir, name)
      const res = await fetch(f.url)
      if (!res.ok) {
        console.log(`✗ ${name} 下载失败 HTTP ${res.status}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(dest, buf)
      console.log(`✓ ${dest}  ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
    }
    return
  }

  console.log(`未知命令：${cmd ?? '(空)'}

用法：
  node tools/ai3d.mjs submit <图片路径> [--lowpoly] [--facecount N] [--pbr]
  node tools/ai3d.mjs query <JobId>
  node tools/ai3d.mjs wait  <JobId> [--outdir public/models]`)
  process.exitCode = 1
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`)
  process.exitCode = 1
})
