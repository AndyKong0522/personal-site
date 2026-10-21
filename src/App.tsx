import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { content, CV_PATH, DISPLAY_LINES, EMAIL, type Content, type Lang } from './content'
import { hero3DMode, prefersReducedMotion, remember3D, type Hero3DMode } from './capabilities'
// 调试角标只在 ?stats=1 时才加载，不占首屏体积
const StatsOverlay = lazy(() => import('./StatsOverlay'))

gsap.registerPlugin(ScrollTrigger)

// three.js 体积大，单独拆包，首屏不阻塞。
const AvatarScene = lazy(() => import('./three/AvatarScene'))

function initialLang(): Lang {
  const saved = localStorage.getItem('lang')
  if (saved === 'zh' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * 留言表单。没有后端密钥时也能用：
 * 先 POST 到 /api/contact（Cloudflare Pages Function），拿到 404/501 或网络失败就退回
 * 打开邮件客户端并把内容填好——不会出现"点了发送什么也没发生"。
 */
function ContactForm({ c, lang }: { c: Content['contact']; lang: Lang }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'fallback' | 'failed'>('idle')
  const formRef = useRef<HTMLFormElement>(null)

  const mailtoFor = (name: string, from: string, message: string) => {
    const subject = lang === 'zh' ? `来自个人网站的留言 · ${name}` : `Message from your website · ${name}`
    const body = `${message}\n\n— ${name} (${from})`
    return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (status === 'sending') return
    const form = formRef.current
    if (!form) return
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const from = String(data.get('email') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()
    if (!name || !from || !message) {
      form.reportValidity()
      return
    }
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email: from, message }),
      })
      // 只有拿到明确的 JSON {ok:true} 才算成功。
      // 静态托管会把未知路径兜底成首页（200 + HTML），那种情况必须当成没配后端。
      const type = res.headers.get('content-type') ?? ''
      const body = type.includes('application/json') ? await res.json().catch(() => null) : null
      if (res.ok && body?.ok === true) {
        form.reset()
        setStatus('ok')
        return
      }
      if (res.status === 404 || res.status === 501 || body?.error === 'not-configured' || !body) {
        window.location.href = mailtoFor(name, from, message)
        setStatus('fallback')
        return
      }
      setStatus('failed')
    } catch {
      window.location.href = mailtoFor(name, from, message)
      setStatus('fallback')
    }
  }

  return (
    <form ref={formRef} className="contact-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="cf-name">{c.form.name}</label>
        <input id="cf-name" name="name" type="text" required maxLength={80} autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="cf-email">{c.form.email}</label>
        <input id="cf-email" name="email" type="email" required maxLength={120} autoComplete="email" />
      </div>
      <div className="field field-wide">
        <label htmlFor="cf-message">{c.form.message}</label>
        <textarea id="cf-message" name="message" rows={5} required maxLength={2000} />
      </div>
      <div className="form-actions">
        <button className="btn btn-solid" type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? c.form.sending : c.form.submit}
        </button>
        <p className="form-status" role="status" aria-live="polite">
          {status === 'ok' && c.form.ok}
          {status === 'fallback' && c.form.fallback}
          {status === 'failed' && (
            <>
              {c.form.failed}{' '}
              <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </>
          )}
        </p>
      </div>
    </form>
  )
}

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang)
  const [reducedMotion] = useState(prefersReducedMotion)
  // 首屏策略：能自动就自动（点过 / 线路够快），否则只给静图 + 一个按钮
  const [mode] = useState<Hero3DMode>(() =>
    new URLSearchParams(location.search).has('static') ? 'none' : hero3DMode(),
  )
  const [use3D, setUse3D] = useState(mode === 'auto')
  const [sceneReady, setSceneReady] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [active, setActive] = useState(0)
  const [showStats] = useState(() => new URLSearchParams(location.search).has('stats'))
  const [heroVisible, setHeroVisible] = useState(true)
  const scrollProgress = useRef(0)
  const pointer = useRef({ x: 0, y: 0 })
  const barRef = useRef<HTMLSpanElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const t = content[lang]

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    localStorage.setItem('lang', lang)
  }, [lang])

  // 首屏策略在 hero3DMode() 里决定；auto 模式下 use3D 初值就是 true，
  // 第一帧就挂 Canvas，让代码包和模型尽早开始下载（两者都已在 index.html 预载）。
  // 想要"只给静图"的验收路径：?static=1；强制加载 3D：?force3d=1。
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.has('force3d')) {
      remember3D()
      setUse3D(true)
    }
  }, [])

  const enable3D = () => {
    remember3D()
    setUse3D(true)
  }

  // 静图先出现，3D 通常一两秒后淡入；慢网可能要十几秒，超过 1.5 秒还没就绪就给一句提示
  useEffect(() => {
    if (!use3D || sceneReady) {
      setShowHint(false)
      return
    }
    const id = setTimeout(() => setShowHint(true), 1500)
    return () => clearTimeout(id)
  }, [use3D, sceneReady])

  // 光标位置（-1~1），供 3D 转头。不经过 React state，避免每帧重渲染。
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // 人像移出视口就停渲染：滚到下面的段落时，3D 不该继续抢 GPU 和主线程。
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0.01 })
    io.observe(el)
    return () => io.disconnect()
  }, [use3D])

  // 左下角的分段指示跟着当前可视区块走。
  useEffect(() => {
    const els = t.sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)
    if (els.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visible) return
        const idx = els.indexOf(visible.target as HTMLElement)
        if (idx >= 0) setActive(idx)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [t])

  // 平滑滚动 + 滚动动效。减少动态效果时全部跳过。
  useLayoutEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0
      scrollProgress.current = p
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    if (reducedMotion) return () => window.removeEventListener('scroll', onScroll)

    const lenis = new Lenis({ autoRaf: false, anchors: true })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    const ctx = gsap.context(() => {
      // 首屏：人像和两列文字随滚动淡出、错位（人像走得比文字快一点）
      gsap.to('.hero-stage', {
        yPercent: -14,
        opacity: 0.12,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      })
      gsap.to('.hero-left', {
        yPercent: -8,
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      })
      gsap.to('.hero-right', {
        yPercent: -4,
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      })
      // 各分段进入视口时淡入。左侧栏不参与（sticky 元素上挂 transform 会让它抖）。
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.from(el, {
          y: 30,
          opacity: 0,
          duration: 0.75,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 90%' },
        })
      })
    }, rootRef)

    return () => {
      window.removeEventListener('scroll', onScroll)
      ctx.revert()
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [reducedMotion])

  return (
    <div ref={rootRef}>
      <a className="skip-link" href="#main">
        {t.a11y.skip}
      </a>

      {/* 整站是一张浮起来的卡片，表头 sticky 在卡片顶部 */}
      <div className="shell">
      <header className="site-header">
        <a className="wordmark" href="#top">
          {t.wordmark}
        </a>
        <nav aria-label={t.a11y.mainNav}>
          {t.sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={t.sections[active]?.id === s.id ? 'is-active' : ''}>
              {s.nav}
            </a>
          ))}
        </nav>
        <a className="nav-cta" href="#contact">
          {t.hero.cta}
        </a>
        <button
          className="lang-toggle"
          type="button"
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          aria-label={t.a11y.switchLang}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </header>

      <main id="main">
        <section className="hero" id="top">
          {/* 头像居中：绝对定位铺满首屏，两列文字压在它上面。
              文字层不接指针事件，人物照样能悬停和拖动。 */}
          <div className="hero-stage" ref={stageRef}>
            <img
              className={`avatar-fallback${sceneReady ? ' is-hidden' : ''}`}
              src="/avatar-portrait.webp"
              alt={t.a11y.avatarAlt}
              width={420}
              height={935}
              decoding="async"
            />
            {mode === 'offer' && !use3D && (
              <button type="button" className="avatar-cta" onClick={enable3D}>
                <span className="avatar-cta-dot" aria-hidden="true" />
                {lang === 'zh' ? '让我动起来' : 'Bring me to life'}
              </button>
            )}
            {showHint && (
              <p className="avatar-hint" aria-live="polite">
                {lang === 'zh' ? '3D 正在加载…' : 'Loading 3D…'}
              </p>
            )}
            {use3D && (
              <Suspense fallback={null}>
                <div className={`avatar-canvas${sceneReady ? ' is-visible' : ''}`}>
                  <AvatarScene
                    scrollProgress={scrollProgress}
                    pointer={pointer}
                    reducedMotion={reducedMotion}
                    paused={!heroVisible}
                    onReady={() => setSceneReady(true)}
                  />
                </div>
              </Suspense>
            )}
          </div>

          <div className="hero-inner">
            <div className="hero-left">
              <p className="eyebrow">{t.hero.eyebrow}</p>
              <p className={`display${lang === 'zh' ? ' is-cjk' : ''}`}>
                {DISPLAY_LINES[lang].map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
              <p className="hero-lead">{t.hero.lead}</p>
              <a className="btn btn-solid hero-cta" href="#contact">
                {t.hero.cta}
              </a>
            </div>

            <div className="hero-right">
              <div className="hero-id">
                {lang === 'zh' ? (
                  <>
                    <span className="hero-id-name">{t.hero.name}</span>
                    <span className="hero-id-sub">{t.hero.nameEn}</span>
                  </>
                ) : (
                  <>
                    <span className="hero-id-latin">{t.hero.name}</span>
                    {t.hero.nameAlt ? <span className="hero-id-alt">{t.hero.nameAlt}</span> : null}
                  </>
                )}
              </div>
              <div className="hero-links">
                <a className="hero-mail" href={`mailto:${EMAIL}`}>
                  {EMAIL}
                </a>
              </div>
            </div>

            <p className="mouse-hint">{t.hero.hint}</p>
          </div>
        </section>

        <section className="section" id="about">
          <header className="section-rail">
            <span className="rail-index">{t.sections[1].index}</span>
            <h2>{t.about.title}</h2>
            <p className="rail-note">{t.about.eyebrow}</p>
          </header>
          <div className="section-body">
            {/* 照片 + 自述并排，三栏放下面通栏 */}
            <div className="about-top reveal">
              <figure className="about-photo">
                <img
                  src="/portrait.webp"
                  alt={t.a11y.photoAlt}
                  width={900}
                  height={1125}
                  loading="lazy"
                  decoding="async"
                />
              </figure>
              <div className="about-bio">
                <p>{t.about.bio}</p>
              </div>
            </div>
            <div className="pillars">
              {t.about.pillars.map((p) => (
                <article key={p.title} className="pillar reveal">
                  <span className="pillar-k">{p.k}</span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="work">
          <header className="section-rail">
            <span className="rail-index">{t.sections[2].index}</span>
            <h2>{t.work.title}</h2>
            <p className="rail-note">{t.work.intro}</p>
          </header>
          <div className="section-body">
            <ol className="rows">
              {t.work.items.map((w) => (
                <li key={w.name} className="row reveal">
                  <span className="row-year">{w.year}</span>
                  <div className="row-main">
                    <h3>{w.name}</h3>
                    <p className="row-meta">{w.meta}</p>
                    <p className="row-desc">{w.desc}</p>
                    <ul className="tags">
                      {w.tags.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" id="research">
          <header className="section-rail">
            <span className="rail-index">{t.sections[3].index}</span>
            <h2>{t.research.title}</h2>
          </header>
          <div className="section-body">
            <p className="lead reveal">{t.research.intro}</p>

            <h3 className="micro-title reveal">{t.research.methodsTitle}</h3>
            <ul className="chips reveal">
              {t.research.methods.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>

            <h3 className="micro-title reveal">{t.research.worksTitle}</h3>
            <div className="works">
              {t.research.works.map((w) => (
                <article key={w.title} className="work reveal">
                  <p className="work-label">{w.label}</p>
                  <h4>{w.title}</h4>
                  <p className="work-meta">{w.meta}</p>
                  <p className="row-desc">{w.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-cv" id="cv">
          <header className="section-rail">
            <span className="rail-index">{t.sections[4].index}</span>
            <h2>{t.cv.title}</h2>
            <p className="rail-note">{t.cv.intro}</p>
          </header>
          <div className="section-body">
            <div className="cv-sheet reveal">
              <div className="cv-download">
                <a className="btn btn-solid" href={CV_PATH} download>
                  {t.cv.downloadLabel}
                </a>
                <a className="btn-link" href={CV_PATH} target="_blank" rel="noopener noreferrer">
                  {t.cv.viewLabel}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <h3 className="micro-title">{t.cv.factsTitle}</h3>
              <dl className="cv-facts">
                {t.cv.facts.map((f) => (
                  <div key={f.k}>
                    <dt>{f.k}</dt>
                    <dd>{f.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className="section" id="contact">
          <header className="section-rail">
            <span className="rail-index">{t.sections[5].index}</span>
            <h2>{t.contact.title}</h2>
            <p className="rail-note">{t.contact.intro}</p>
          </header>
          <div className="section-body">
            <p className="contact-big reveal">
              <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </p>
            <dl className="contact-links reveal">
              {t.contact.links.map((l) => (
                <div key={l.label}>
                  <dt>{l.label}</dt>
                  <dd>
                    <a href={l.href} target="_blank" rel="noopener noreferrer me">
                      {l.value}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  </dd>
                </div>
              ))}
            </dl>

            <div className="contact-form-wrap reveal">
              <h3 className="micro-title">{t.contact.formTitle}</h3>
              <ContactForm c={t.contact} lang={lang} />
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <span>
          © {new Date().getFullYear()} {t.wordmark}
        </span>
        <a href="#top">{lang === 'zh' ? '回到顶部 ↑' : 'Back to top ↑'}</a>
      </footer>
      </div>

      {/* 左下角分段指示 + 底部进度条 */}
      <div className="hud-index" aria-hidden="true">
        {t.sections[active]?.index ?? '01'} / {t.sections[active]?.label ?? ''}
      </div>
      <div className="progress" aria-hidden="true">
        <span ref={barRef} className="progress-bar" />
      </div>
      {showStats && (
        <Suspense fallback={null}>
          <StatsOverlay />
        </Suspense>
      )}
    </div>
  )
}
