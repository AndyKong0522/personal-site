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
    return json({ ok: false, error: 'not-found' }, 404)
  },
}
