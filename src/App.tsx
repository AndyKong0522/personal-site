import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { content, DISPLAY_LINES, EMAIL, type Lang } from './content'
import { canRender3D, prefersReducedMotion, slowNetwork } from './capabilities'
import StatsOverlay from './StatsOverlay'

gsap.registerPlugin(ScrollTrigger)

// three.js 体积大，单独拆包，首屏不阻塞。
const AvatarScene = lazy(() => import('./three/AvatarScene'))

function initialLang(): Lang {
  const saved = localStorage.getItem('lang')
  if (saved === 'zh' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang)
  const [reducedMotion] = useState(prefersReducedMotion)
  const [use3D, setUse3D] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [active, setActive] = useState(0)
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

  // 首屏渲染完就尽快加载 3D。
  useEffect(() => {
    // 慢网/省流量：不加载 three.js 和模型，直接用静态渲染图（66 KB）
    // ?static=1 可以强制走这条路，方便本地验收
    if (!canRender3D() || slowNetwork() || new URLSearchParams(location.search).has('static')) return
    const start = () => setUse3D(true)
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(start, { timeout: 300 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(start, 120)
    return () => clearTimeout(id)
  }, [])

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

  // 人像移出视口就停渲染：滚到下面的项目/研究区时，3D 不该继续抢 GPU 和主线程。
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
      // 首页 3D 层随滚动淡出、上移（视差）。
      gsap.to('.hero-stage', {
        yPercent: -16,
        opacity: 0.12,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      })
      gsap.to('.hero-copy', {
        yPercent: -8,
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      })
      // 各分段进入视口时淡入。
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.from(el, {
          y: 34,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%' },
        })
      })
      // 时间线：竖线随滚动画出。
      gsap.from('.timeline-line', {
        scaleY: 0,
        transformOrigin: 'top',
        ease: 'none',
        scrollTrigger: { trigger: '.timeline', start: 'top 75%', end: 'bottom 65%', scrub: true },
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
        <div className="header-meta">
          <span className="header-role">{t.hero.role}</span>
          <span className="header-sub">{t.hero.roleSub}</span>
        </div>
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
          {/* 3D 层：居中人像。pointer-events 关掉，不挡住上面的文字和按钮 */}
          <div className="hero-stage" ref={stageRef}>
            <img
              className={`avatar-fallback${sceneReady ? ' is-hidden' : ''}`}
              src="/avatar-portrait.webp"
              alt={t.a11y.avatarAlt}
              width={420}
              height={935}
              decoding="async"
            />
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

          <div className="hero-inner hero-copy">
            <div className="hero-left">
              <p className="eyebrow">{t.hero.eyebrow}</p>
              <h1 className="display">
                {DISPLAY_LINES.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h1>
              <p className="greeting">{t.hero.greeting}</p>
              <p className="hero-lead">{t.hero.lead}</p>
              <a className="cta" href="#about">
                {t.hero.cta}
                <span className="cta-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            </div>
            <div className="hero-right">
              <h2 className="side-title">{t.hero.sideTitle}</h2>
              <ul className="side-lines">
                {t.hero.sideLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="hero-foot hero-copy">
            <p className="hero-blurb">{t.hero.blurb}</p>
            <div className="hero-foot-row">
              <span className="scroll-hint">{t.hero.scroll} ↓</span>
              <span className="mouse-hint">{t.hero.hint}</span>
            </div>
          </div>
        </section>

        <section className="section" id="about">
          <header className="section-head reveal">
            <p className="eyebrow">
              {t.sections[1].index} / {t.sections[1].label}
            </p>
            <h2>{t.about.title}</h2>
            <p className="sub-eyebrow">{t.about.eyebrow}</p>
          </header>
          <p className="lead reveal">{t.about.intro}</p>

          <h3 className="sub-title reveal">{t.about.timelineTitle}</h3>
          <ol className="timeline">
            <span className="timeline-line" aria-hidden="true" />
            {t.timeline.map((item) => (
              <li key={item.time} className="reveal">
                <span className="time">{item.time}</span>
                <span className="tl-title">{item.title}</span>
                <span className="tl-text">{item.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="section" id="projects">
          <header className="section-head reveal">
            <p className="eyebrow">
              {t.sections[2].index} / {t.sections[2].label}
            </p>
            <h2>{t.projects.title}</h2>
            <p className="sub-eyebrow">{t.projects.intro}</p>
          </header>
          <div className="cards">
            {t.projects.items.map((p) => (
              <article key={p.name} className="card reveal">
                <h3>{p.name}</h3>
                <p className="card-meta">{p.meta}</p>
                <p className="card-desc">{p.desc}</p>
                <ul className="tags">
                  {p.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="research">
          <header className="section-head reveal">
            <p className="eyebrow">
              {t.sections[3].index} / {t.sections[3].label}
            </p>
            <h2>{t.research.title}</h2>
          </header>
          <p className="lead reveal">{t.research.intro}</p>

          <h3 className="sub-title reveal">{t.research.interestsTitle}</h3>
          <ul className="tags tags-lg reveal">
            {t.research.interests.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>

          <h3 className="sub-title reveal">{t.research.worksTitle}</h3>
          <div className="works">
            {t.research.works.map((w) => (
              <article key={w.title} className="work reveal">
                <p className="work-label">{w.label}</p>
                <h4>{w.title}</h4>
                <p className="work-meta">{w.meta}</p>
                <p className="card-desc">{w.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="contact">
          <header className="section-head reveal">
            <p className="eyebrow">
              {t.sections[4].index} / {t.sections[4].label}
            </p>
            <h2>{t.contact.title}</h2>
            <p className="sub-eyebrow">{t.contact.intro}</p>
          </header>
          <dl className="contact-list reveal">
            <dt>{t.contact.emailLabel}</dt>
            <dd>
              <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </dd>
            <dt>{t.contact.linksTitle}</dt>
            <dd className="pending">
              LinkedIn · GitHub
              <span className="pending-note">{lang === 'zh' ? '待补充' : 'to be added'}</span>
            </dd>
          </dl>
        </section>
      </main>

      <footer className="site-footer">
        <span>
          © {new Date().getFullYear()} {t.wordmark}
        </span>
        <a href="#top">{lang === 'zh' ? '回到顶部 ↑' : 'Back to top ↑'}</a>
      </footer>

      {/* 左下角分段指示 + 底部进度条 */}
      <div className="hud-index" aria-hidden="true">
        {t.sections[active]?.index ?? '01'} / {t.sections[active]?.label ?? ''}
      </div>
      <div className="progress" aria-hidden="true">
        <span ref={barRef} className="progress-bar" />
      </div>
      <StatsOverlay />
    </div>
  )
}
