#!/usr/bin/env node
/**
 * 腾讯云通用 API 调用（TC3-HMAC-SHA256 签名）
 *
 * tools/hunyuan3d.mjs 只认死 ai3d 这一个产品；这个工具是通用的，
 * 用来查余额、查账单等任意腾讯云接口。
 *
 * 密钥从 .env 读 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（该文件已 gitignore）。
 *
 * 用法：
 *   node tools/tencent-call.mjs <Action> --service <产品> [--version <版本>] [--region <地域>] [--json-file f]
 *
 * 例：
 *   node tools/tencent-call.mjs DescribeAccountBalance --service billing --version 2018-07-09
 */
import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const action = args[0]
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const service = opt('service')
const version = opt('version', '')
const region = opt('region', '')
const jsonFile = opt('json-file')
const envFile = opt('env', '.env')

if (!action || !service) {
  console.error('用法：node tools/tencent-call.mjs <Action> --service <产品> [--version v] [--region r] [--json-file f] [--env .env]')
  process.exit(1)
}

async function loadKeys() {
  const env = await readFile(envFile, 'utf8').catch(() => {
    throw new Error(`读不到 ${envFile}`)
  })
  const pick = (n) => {
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${n}=`))
    return line ? line.slice(n.length + 1).trim() : ''
  }
  const id = pick('TENCENT_SECRET_ID')
  const key = pick('TENCENT_SECRET_KEY')
  if (!id || !key) throw new Error(`${envFile} 里缺 TENCENT_SECRET_ID / TENCENT_SECRET_KEY`)
  return { id, key }
}

const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
const hmac = (k, m) => createHmac('sha256', k).update(m, 'utf8').digest()

const host = `${service}.tencentcloudapi.com`
const { id, key } = await loadKeys()

let payload = '{}'
if (jsonFile) {
  let raw = await readFile(jsonFile, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  payload = JSON.stringify(JSON.parse(raw))
}

const timestamp = Math.floor(Date.now() / 1000)
const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
const contentType = 'application/json; charset=utf-8'

const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`
const signedHeaders = 'content-type;host'
const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256hex(payload)].join('\n')
const scope = `${date}/${service}/tc3_request`
const stringToSign = ['TC3-HMAC-SHA256', timestamp, scope, sha256hex(canonicalRequest)].join('\n')

const kDate = hmac(`TC3${key}`, date)
const kService = hmac(kDate, service)
const kSigning = hmac(kService, 'tc3_request')
const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

const headers = {
  Authorization: `TC3-HMAC-SHA256 Credential=${id}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  'Content-Type': contentType,
  Host: host,
  'X-TC-Action': action,
  'X-TC-Timestamp': String(timestamp),
}
if (version) headers['X-TC-Version'] = version
if (region) headers['X-TC-Region'] = region

const res = await fetch(`https://${host}/`, { method: 'POST', headers, body: payload })
const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  console.error(`返回不是 JSON（HTTP ${res.status}）：${text.slice(0, 300)}`)
  process.exit(1)
}
if (json.Response?.Error) {
  const e = json.Response.Error
  console.error(`✗ ${e.Code}：${e.Message}（RequestId ${json.Response.RequestId}）`)
  process.exit(1)
}
console.log(JSON.stringify(json.Response, null, 2))
