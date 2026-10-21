/**
 * POST /api/contact —— 个人网站的联系表单后端（Cloudflare Pages Function）。
 *
 * 没有配置密钥时**故意返回 501**，让前端退回「打开邮件客户端并把内容填好」，
 * 这样表单永远不会出现"点了发送、什么也没发生"。
 *
 * 要让它真的发邮件，在 Cloudflare Pages 项目里加环境变量：
 *   RESEND_API_KEY   Resend 的 API key（免费额度每月 3000 封）
 *   CONTACT_TO       收件邮箱，默认 andykong.work@outlook.com
 *   CONTACT_FROM     发件人，必须是 Resend 里验证过的域名，例如 site@gonghuipeng.com
 * 然后在 Resend 后台把 gonghuipeng.com 的 DNS 记录加上（Cloudflare 上两分钟）。
 */

const DEFAULT_TO = 'andykong.work@outlook.com'
const MAX = { name: 80, email: 120, message: 2000 }

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)

export async function onRequestPost({ request, env }) {
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
  const to = env?.CONTACT_TO || DEFAULT_TO
  const from = env?.CONTACT_FROM

  // 还没配：让前端走邮件客户端那条路，别假装成功
  if (!key || !from) return json({ ok: false, error: 'not-configured' }, 501)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
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

export async function onRequestGet() {
  return json({ ok: false, error: 'method-not-allowed' }, 405)
}
