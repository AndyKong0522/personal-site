#!/usr/bin/env node
/**
 * 腾讯混元生图（OpenAI 兼容接口）命令行工具
 *
 * 接入点：https://api.cloudai.tencent.com/v1/aiart
 * 鉴权：请求头 Authorization 直接放 sk- 开头的 API Key（加不加 Bearer 都行）
 * 说明：images 数组传参考图，配合 prompt 做「按指令改图 / 多图参考」
 *
 * 用法：
 *   node tools/aiart.mjs submit <参考图路径|-> "<prompt>" [--size 1024:1024] [--seed N]
 *   node tools/aiart.mjs query <job_id>
 *   node tools/aiart.mjs wait  <job_id> [--outdir .tmp-tools/out]
 *
 * Key 从项目根目录 .env 的 API_KEY 读取（该文件已在 .gitignore 中）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

const BASE = 'https://api.cloudai.tencent.com/v1/aiart'
const MODEL = 'HY-Image-V3.0'
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
  if (json.error) throw new Error(`${json.error.code}：${json.error.message}`)
  return json
}

function parseArgs(argv) {
  const opts = { size: '1024:1024', seed: null, outdir: null }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--size') opts.size = argv[++i]
    else if (a === '--seed') opts.seed = Number(argv[++i])
    else if (a === '--outdir') opts.outdir = argv[++i]
    else positional.push(a)
  }
  return { opts, positional }
}

/** 把本地图片转成 data URI（混元生图的 images 数组实测接受这种写法） */
async function toDataUri(p) {
  const ext = extname(p).toLowerCase()
  if (!MIME[ext]) throw new Error(`不支持的图片格式 ${ext}`)
  const buf = await readFile(p)
  return `data:${MIME[ext]};base64,${buf.toString('base64')}`
}

async function cmdSubmit([imgPath, prompt], opts, key) {
  if (!prompt) throw new Error('用法：submit <参考图路径> "<prompt>" [--size 1024:1024]')
  const body = { model: MODEL, prompt, size: opts.size }
  if (imgPath && imgPath !== '-') {
    body.images = [await toDataUri(imgPath)]
    console.log(`参考图：${basename(imgPath)}`)
  }
  const extra = {}
  if (opts.seed != null) extra.seed = opts.seed
  extra.revise = 0
  body.extra_body = extra

  const r = await call('/submit', body, key)
  console.log(`job_id：${r.job_id}`)
  return r.job_id
}

async function cmdQuery([jobId], _opts, key) {
  if (!jobId) throw new Error('用法：query <job_id>')
  const r = await call('/query', { job_id: jobId }, key)
  console.log(JSON.stringify(r, null, 2))
  return r
}

async function cmdWait([jobId], opts, key) {
  if (!jobId) throw new Error('用法：wait <job_id>')
  for (let i = 0; i < 180; i++) {
    const r = await call('/query', { job_id: jobId }, key)
    const urls = (r.data ?? []).map((d) => d.url).filter(Boolean)
    process.stdout.write(`\r[${i * 5}s] status=${r.status ?? '?'} 图片数=${urls.length}      `)

    if (urls.length) {
      console.log('')
      const outdir = opts.outdir ?? '.'
      await mkdir(outdir, { recursive: true })
      for (let n = 0; n < urls.length; n++) {
        const res = await fetch(urls[n])
        if (!res.ok) {
          console.log(`✗ 第 ${n + 1} 张下载失败 HTTP ${res.status}`)
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const dest = join(outdir, `${jobId}-${n + 1}.png`)
        await writeFile(dest, buf)
        console.log(`✓ ${dest}  ${(buf.length / 1024).toFixed(0)} KB`)
      }
      return r
    }
    // 明显失败就退出
    if (r.status && !['1', '2', '3', '4', ''].includes(String(r.status)) && r.error) {
      console.log('')
      console.log(JSON.stringify(r, null, 2))
      throw new Error('任务失败')
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
  node tools/aiart.mjs submit <参考图路径|-> "<prompt>" [--size 1024:1024]
  node tools/aiart.mjs query <job_id>
  node tools/aiart.mjs wait  <job_id> [--outdir .tmp-tools/out]`)
  process.exitCode = 1
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`)
  process.exitCode = 1
})
