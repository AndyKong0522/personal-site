#!/usr/bin/env node
/**
 * 腾讯混元生3D 专业版 —— 标准云 API（TC3-HMAC-SHA256 签名）
 *
 * 和 tools/ai3d.mjs 的区别：
 *   ai3d.mjs  走 api.ai3d.cloud.tencent.com（网关，Authorization: sk-...）
 *   本工具     走 ai3d.tencentcloudapi.com（标准云 API，SecretId + SecretKey 签名）
 *   免费赠送的 100 积分走的是标准云 API 这条路。
 *
 * 接口：SubmitHunyuanTo3DProJob / QueryHunyuanTo3DProJob，Version 2025-05-13
 * 文档：https://cloud.tencent.cn/document/api/1804/123447
 *
 * 密钥从 .env 读 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（该文件已 gitignore）。
 * ⚠️ 这两个密钥等同账号密码，用完记得去控制台轮换。
 *
 * 用法：
 *   node tools/hunyuan3d.mjs submit <图片> [--views front=a.jpg,back=b.jpg] [--model 3.0] [--region ap-guangzhou]
 *   node tools/hunyuan3d.mjs query <JobId>
 *   node tools/hunyuan3d.mjs wait  <JobId> [--outdir .tmp-tools/hunyuan]
 */
import { createHash, createHmac } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

const HOST = 'ai3d.tencentcloudapi.com'
const SERVICE = 'ai3d'
const VERSION = '2025-05-13'
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const MAX_B64 = 6 * 1024 * 1024

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const hmac = (key, msg) => createHmac('sha256', key).update(msg, 'utf8').digest()

async function loadKeys() {
  const env = await readFile('.env', 'utf8')
  const pick = (name) => {
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`))
    return line ? line.slice(name.length + 1).trim() : ''
  }
  const id = pick('TENCENT_SECRET_ID')
  const key = pick('TENCENT_SECRET_KEY')
  if (!id || !key) throw new Error('.env 里缺 TENCENT_SECRET_ID / TENCENT_SECRET_KEY')
  return { id, key }
}

/** TC3-HMAC-SHA256 签名（腾讯云 API 3.0 标准流程） */
function sign({ secretId, secretKey, action, region, payload }) {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const contentType = 'application/json; charset=utf-8'

  const canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    sha256hex(payload),
  ].join('\n')

  const scope = `${date}/${SERVICE}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, scope, sha256hex(canonicalRequest)].join('\n')

  const kDate = hmac(`TC3${secretKey}`, date)
  const kService = hmac(kDate, SERVICE)
  const kSigning = hmac(kService, 'tc3_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  return {
    url: `https://${HOST}/`,
    headers: {
      Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Content-Type': contentType,
      Host: HOST,
      'X-TC-Action': action,
      'X-TC-Version': VERSION,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': region,
    },
    body: payload,
  }
}

async function call(action, region, params) {
  const keys = await loadKeys()
  const payload = JSON.stringify(params)
  const req = sign({ secretId: keys.id, secretKey: keys.key, action, region, payload })
  const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`返回不是 JSON（HTTP ${res.status}）：${text.slice(0, 300)}`)
  }
  if (json.Response?.Error) {
    const e = json.Response.Error
    throw new Error(`${e.Code}：${e.Message}（RequestId ${json.Response.RequestId}）`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}：${text.slice(0, 300)}`)
  return json.Response
}

function parseArgs(argv) {
  const opts = { region: 'ap-guangzhou', model: '3.0', generateType: null, views: [], outdir: null, json: null, jsonFile: null }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--region') opts.region = argv[++i]
    else if (a === '--model') opts.model = argv[++i]
    else if (a === '--generate-type') opts.generateType = argv[++i]
    else if (a === '--lowpoly') opts.generateType = 'LowPoly'
    else if (a === '--outdir') opts.outdir = argv[++i]
    else if (a === '--json') opts.json = argv[++i]
    else if (a === '--json-file') opts.jsonFile = argv[++i]
    else if (a === '--views') {
      opts.views = argv[++i].split(',').map((s) => {
        const [view, path] = s.split('=')
        return { view: view.trim(), path: path.trim() }
      })
    } else positional.push(a)
  }
  return { opts, positional }
}

/** 通用调用：Action 名 + 任意 JSON 参数，用来跑降面 / 绑骨等本工具没封装的动作 */
async function cmdCall([action], opts) {
  if (!action) throw new Error('用法：call <Action> --json-file params.json')
  let params = {}
  if (opts.jsonFile) {
    // PowerShell 的 Set-Content -Encoding utf8 会带 BOM，JSON.parse 吃不下
    let raw = await readFile(opts.jsonFile, 'utf8')
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
    params = JSON.parse(raw)
  } else if (opts.json) params = JSON.parse(opts.json)
  const r = await call(action, opts.region, params)
  console.log(JSON.stringify(r, null, 2))
  return r
}

async function toB64(path) {
  const ext = extname(path).toLowerCase()
  if (!MIME[ext]) throw new Error(`${path} 格式不支持（${ext}）`)
  const buf = await readFile(path)
  const b64 = buf.toString('base64')
  if (b64.length > MAX_B64) {
    throw new Error(`${path} base64 后 ${(b64.length / 1024 / 1024).toFixed(2)} MB，超过 6 MB（用 tools/resize.py 压一下）`)
  }
  return { b64, ext }
}

async function cmdSubmit([imgPath], opts) {
  if (!imgPath) throw new Error('用法：submit <图片> [--views front=,back=]')
  const { b64, ext } = await toB64(imgPath)
  const body = { Model: opts.model, ImageBase64: `data:${MIME[ext]};base64,${b64}` }

  // 多视角：正面永远走主图 ImageBase64；ViewType 只认 back / left / right（没有 front）
  const list = []
  for (const v of opts.views) {
    if (v.view === 'front') continue
    if (!['back', 'left', 'right'].includes(v.view)) {
      throw new Error(`ViewType 只能是 back / left / right，收到 ${v.view}`)
    }
    const one = await toB64(v.path)
    list.push({ ViewType: v.view, ViewImageBase64: `data:${MIME[one.ext]};base64,${one.b64}` })
  }
  if (list.length) {
    body.MultiViewImages = list
    if (opts.model !== '3.1') console.log('⚠️  多视角只在 Model=3.1 下生效，当前是 ' + opts.model)
    console.log(`多视角：${list.map((x) => x.ViewType).join(', ')}`)
  }
  if (opts.generateType) body.GenerateType = opts.generateType

  console.log(`模型 ${opts.model}  区域 ${opts.region}  主图 ${basename(imgPath)}  base64 ${(b64.length / 1024).toFixed(0)} KB`)

  const r = await call('SubmitHunyuanTo3DProJob', opts.region, body)
  console.log(`JobId：${r.JobId}`)
  console.log(`RequestId：${r.RequestId}`)
  return r.JobId
}

async function cmdQuery([jobId], opts) {
  if (!jobId) throw new Error('用法：query <JobId>')
  const r = await call('QueryHunyuanTo3DProJob', opts.region, { JobId: jobId })
  console.log(JSON.stringify(r, null, 2))
  return r
}

async function cmdWait([jobId], opts) {
  if (!jobId) throw new Error('用法：wait <JobId>')
  for (let i = 0; i < 180; i++) {
    const r = await call('QueryHunyuanTo3DProJob', opts.region, { JobId: jobId })
    const status = r.Status ?? '?'
    process.stdout.write(`\r[${i * 5}s] ${status}        `)
    if (status === 'DONE' || status === 'FAIL') {
      console.log('')
      if (status === 'FAIL') {
        console.log(JSON.stringify(r, null, 2).slice(0, 1500))
        throw new Error('任务失败')
      }
      const files = r.ResultFile3Ds ?? []
      if (!files.length) {
        console.log(JSON.stringify(r, null, 2).slice(0, 1500))
        throw new Error('没有结果文件')
      }
      const outdir = opts.outdir ?? '.tmp-tools/hunyuan'
      await mkdir(outdir, { recursive: true })
      for (const f of files) {
        const name = decodeURIComponent(f.Url.split('?')[0].split('/').pop())
        const ext = (f.Type ?? extname(name).slice(1) ?? 'glb').toLowerCase()
        const dest = join(outdir, name.endsWith(`.${ext}`) ? name : `${name}.${ext}`)
        const res = await fetch(f.Url)
        if (!res.ok) { console.log(`✗ ${name} HTTP ${res.status}`); continue }
        const buf = Buffer.from(await res.arrayBuffer())
        await writeFile(dest, buf)
        console.log(`✓ ${dest}  ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
      }
      console.log(`\n消耗：${JSON.stringify(r.ResultCreditDetails ?? {})}`)
      return r
    }
    await sleep(5000)
  }
  throw new Error('等待超时')
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const { opts, positional } = parseArgs(rest)
  if (cmd === 'submit') return void (await cmdSubmit(positional, opts))
  if (cmd === 'query') return void (await cmdQuery(positional, opts))
  if (cmd === 'wait') return void (await cmdWait(positional, opts))
  if (cmd === 'call') return void (await cmdCall(positional, opts))

  console.log(`未知命令：${cmd ?? '(空)'}

用法：
  node tools/hunyuan3d.mjs submit <图片> [--views front=a.jpg,back=b.jpg] [--model 3.0] [--lowpoly] [--region ap-guangzhou]
  node tools/hunyuan3d.mjs query <JobId>
  node tools/hunyuan3d.mjs wait  <JobId> [--outdir .tmp-tools/hunyuan]
  node tools/hunyuan3d.mjs call  <Action> --json-file params.json`)
  process.exitCode = 1
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`)
  process.exitCode = 1
})
