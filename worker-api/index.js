/**
 * gonghuipeng.com 的联系表单接口（独立 Worker，只接管 /api/*）。
 *
 * 为什么不是 Pages Functions：站点是「静态资源 Worker + Custom Domain」，
 * 没有 functions/ 那套运行时，Pages Functions 永远不会被部署。
 *
 * 变量（wrangler.toml 的 [vars]）：
 *   CONTACT_TO    收件邮箱
 *   CONTACT_FROM  Resend 里验证过的发件地址
 * 密钥（wrangler secret）：
 *   RESEND_API_KEY
 */

const MAX = { name: 80, email: 120, message: 2000 }

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)

/**
 * 访客记录。免费版 Cloudflare 不保存 HTTP 访问日志，Zone Analytics 只有总量、没有 IP，
 * 所以页面打一个 beacon 过来，由这里把 IP / 地区 / 运营商 / 来源存进 KV，90 天自动过期。
 * 读取需要 ?key=<VISITS_KEY>，比对的是 wrangler secret 里的值。
 */
function clientIp(request) {
  // cf-connecting-ip 由 Cloudflare 写入，访客伪造不了
  return request.headers.get('cf-connecting-ip') ?? ''
}

/** 只留前两段：49.71.x.x */
const maskIp = (ip) => {
  if (!ip) return ''
  const v4 = ip.split('.')
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.x.x`
  return ip.split(':').slice(0, 2).join(':') + '::x'
}

const BOT_RE = /bot|crawler|spider|curl|wget|python-requests|headless|monitor|preview|slurp|facebookexternalhit|whatsapp|telegram|googlebot|bingpreview/i

async function handleHit(request, env) {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return json({ ok: false, error: 'method-not-allowed' }, 405)
  }
  if (!env?.HITS) return json({ ok: false, error: 'not-configured' }, 501)

  let body = {}
  try {
    body = (await request.json()) ?? {}
  } catch {
    /* 没带 body 也记一条，至少留下地区和 IP */
  }

  const cf = request.cf ?? {}
  const ip = clientIp(request)
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 220)
  const at = new Date().toISOString()

  const entry = {
    at,
    ip,
    ipMasked: maskIp(ip),
    country: cf.country ?? null,
    region: cf.region ?? null,
    city: cf.city ?? null,
    asn: cf.asn ?? null,
    isp: cf.asOrganization ?? null,
    page: String(body?.path ?? '').slice(0, 300) || null,
    lang: String(body?.lang ?? '').slice(0, 12) || null,
    ref: String(body?.ref ?? '').slice(0, 300) || null,
    ua,
    bot: BOT_RE.test(ua),
  }

  await env.HITS.put(`hit:${at}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify(entry), {
    expirationTtl: 90 * 24 * 3600,
  })

  return json({ ok: true }, 200)
}

async function handleVisits(request, env) {
  if (!env?.VISITS_KEY || !env?.HITS) return json({ ok: false, error: 'not-configured' }, 501)
  const url = new URL(request.url)
  if (url.searchParams.get('key') !== env.VISITS_KEY) return json({ ok: false, error: 'forbidden' }, 403)

  const limit = Math.min(Number(url.searchParams.get('limit') ?? 300) || 300, 1000)
  const list = await env.HITS.list({ prefix: 'hit:', limit, reverse: true })
  const values = await Promise.all(list.keys.map((k) => env.HITS.get(k.name, 'json')))
  const all = values.filter(Boolean)
  const keepBots = url.searchParams.get('bots') === '1'
  const rows = keepBots ? all : all.filter((h) => !h.bot)

  const byDay = {}
  const byPlace = {}
  for (const h of rows) {
    const d = h.at.slice(0, 10)
    byDay[d] = (byDay[d] ?? 0) + 1
    const p = [h.country, h.city].filter(Boolean).join(' · ') || '未知'
    byPlace[p] = (byPlace[p] ?? 0) + 1
  }

  return json({ ok: true, count: rows.length, botsSkipped: all.length - rows.length, byDay, byPlace, hits: rows }, 200)
}


async function handleContact(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405)

  let data
  try {
    data = await request.json()
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400)
  }

  const name = String(data?.name ?? '').trim()
  const email = String(data?.email ?? '').trim()
  const message = String(data?.message ?? '').trim()

  if (!name || !email || !message) return json({ ok: false, error: 'missing-field' }, 400)
  if (name.length > MAX.name || email.length > MAX.email || message.length > MAX.message) {
    return json({ ok: false, error: 'too-long' }, 400)
  }
  if (!looksLikeEmail(email)) return json({ ok: false, error: 'bad-email' }, 400)

  const key = env?.RESEND_API_KEY
  const to = env?.CONTACT_TO
  const from = env?.CONTACT_FROM
  if (!key || !to || !from) return json({ ok: false, error: 'not-configured' }, 501)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: email,
      subject: `网站留言 · ${name}`,
      text: `${message}\n\n—— ${name}（${email}）`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return json({ ok: false, error: 'upstream', detail: detail.slice(0, 300) }, 502)
  }

  return json({ ok: true }, 200)
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/contact') return handleContact(request, env)
    // 前端据此选默认语言：中国大陆 IP → 中文，其余 → 英文。只回国家代码，不记录任何东西。
    if (pathname === '/api/geo') return json({ country: request.cf?.country ?? null }, 200)
    if (pathname === '/api/hit') return handleHit(request, env)
    if (pathname === '/api/visits') return handleVisits(request, env)
    return json({ ok: false, error: 'not-found' }, 404)
  },
}
