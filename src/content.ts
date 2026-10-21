// 网站文案（中 / 英）。
//
// 定位（2026-10-20 本人定）："做 AI 系统 + 做判断它好不好用的评测"，不把自己叫社会学家。
//   —— 造 / 量 / 证 三条线。
//   —— 写作与研究只在"方法取径"层面描述，不写研究兴趣的具体选题（本人要求：不想被某个方向框住）。
//
// 语言规则（2026-10-20 本人要求）：
//   中文页面不出现英文。只保留三类专有名词：人名 / 学校公司产品名 / 论文标题与期刊名。
//   编程语言与框架名（Python、R、C++、Git）也保留——翻译成中文反而没人认识。
//
// 事实来源：E:\Andy_Work\cv\master_cv_en.md 的「已确认的事实基线」、data/profile.md、
// data/work/phd-applications.md。规则：只写真实内容；不确定的标【待确认】并当面问。
// 隐私：不放手机号、住址；联系方式只有工作邮箱 + LinkedIn / GitHub。

export type Lang = 'zh' | 'en'

/** 展示字：中文用汉字，英文用拉丁展示字体。 */
export const DISPLAY_LINES: Record<Lang, readonly string[]> = {
  zh: ['造', '量', '证'],
  en: ['BUILD', 'MEASURE', 'PROVE'],
}

type SectionMeta = { id: string; index: string; nav: string; label: string }

const SECTIONS: Record<Lang, SectionMeta[]> = {
  zh: [
    { id: 'top', index: '01', nav: '首页', label: '拱慧鹏' },
    { id: 'about', index: '02', nav: '关于', label: '我做的事' },
    { id: 'work', index: '03', nav: '工作', label: '做过的' },
    { id: 'research', index: '04', nav: '研究', label: '论文与研究' },
    { id: 'cv', index: '05', nav: '简历', label: '简历' },
    { id: 'contact', index: '06', nav: '联系', label: '联系' },
  ],
  en: [
    { id: 'top', index: '01', nav: 'Intro', label: 'Huipeng Gong' },
    { id: 'about', index: '02', nav: 'About', label: 'What I do' },
    { id: 'work', index: '03', nav: 'Work', label: 'Selected work' },
    { id: 'research', index: '04', nav: 'Research', label: 'Writing' },
    { id: 'cv', index: '05', nav: 'CV', label: 'CV' },
    { id: 'contact', index: '06', nav: 'Contact', label: 'Contact' },
  ],
}

export const EMAIL = 'andykong.work@outlook.com'

/** 学术身份与职业主页（2026-10-20 本人提供）。GitHub 暂不放。 */
export const ORCID = '0009-0002-6340-2325'
export const ORCID_URL = 'https://orcid.org/0009-0002-6340-2325'
export const LINKEDIN_URL = 'https://www.linkedin.com/in/huipeng-gong'

/** 简历文件放在 public/cv/cv-en.pdf，内容见 data/work/cv-public-en.html（导出源）。 */
export const CV_PATH = '/cv/cv-en.pdf'

export const content = {
  zh: {
    wordmark: 'Andy.',
    sections: SECTIONS.zh,
    hero: {
      eyebrow: '人工智能应用开发工程师 · 华为 · 上海',
      name: '拱慧鹏',
      nameEn: 'Huipeng Gong',
      nameAlt: '',
      cta: '联系我',
      lead: '用工程把人工智能系统做出来，再用社会科学的方法检验它：评测可不可信，测量测到的是不是想测的，结论能不能落到证据上。一手写数据管线和智能体，一手做文本分析、结构方程与人工编码校验。',
      hint: '移动鼠标我会看你 · 悬停头部或手试试 · 按住可拖动',
    },
    about: {
      title: '我做的事',
      eyebrow: '造 / 量 / 证',
      pillars: [
        {
          k: '造',
          title: '把系统做出来',
          text: '数据采集与管线、检索、智能体与本地部署。把模型接进真会跑的系统，而不是停在笔记本里。',
        },
        {
          k: '量',
          title: '量它准不准',
          text: '评测集、基线对照、拒答与溯源。结论要能绑到证据上：证据不够的时候说"不知道"，这不是保守，是准确。',
        },
        {
          k: '证',
          title: '说清为什么',
          text: '结构方程模型、中介机制检验、模型分类与人工编码的一致性。先问这个数字测的是什么，再谈它说明什么。',
        },
      ],
      bio: '本科读国际贸易，硕士转社会学，毕业后做工程。顺序看着像绕路，凑成的东西不多见：能写爬虫和管线，也知道怎么设计一个可信的测量。现在白天在华为做人工智能应用组件和人机交互评测，业余自己搭小工具。',
    },
    work: {
      title: '做过的',
      intro: '能跑起来的，不是设想。',
      items: [
        {
          year: '2025',
          name: 'Droppulses',
          meta: '独立开发 · 生成式人工智能与多智能体',
          desc: '一套由生成式人工智能与多智能体自主执行任务的系统，自建接口把大模型服务接进真实的商业平台，完成本地模型部署与生产环境集成；同步记录交互日志，观察人工智能中介的交流如何影响用户决策。',
          tags: ['多智能体', '模型接口', '生产环境'],
        },
        {
          year: '2024',
          name: '社交媒体监听平台',
          meta: '实时抓取 · 清洗 · 分类',
          desc: '多源在线数据的实时抓取、清洗与分类，用数据库撑住增量写入；在其上用自然语言处理从大规模非结构化文本里提取利益相关方关切与情感指标，服务于对企业层面的量化分析。',
          tags: ['抓取', '数据库', '文本分析'],
        },
        {
          year: '2022',
          name: '大规模网络结构的图神经网络建模',
          meta: '中国计算机学会大数据与计算智能大赛 · 9/159',
          desc: '带注意力机制的多尺度图神经网络，在节点、子图、全图三个层面建模复杂网络；噪声感知的对比模块动态重加权锚点，降低监督误差的影响；多维度消融逐项验证，分类准确率较基线提升 18%。',
          tags: ['图神经网络', '注意力机制', '消融实验'],
        },
      ],
    },
    research: {
      title: '论文与研究',
      intro: '方法上在计算文本分析与经典社会统计之间来回走，看问题需要哪个。',
      methodsTitle: '常用的方法',
      methods: [
        '结构方程模型',
        '中介与调节分析',
        '计算文本分析（主题建模、情感分析）',
        '网络分析（图神经网络）',
        '调查设计与信效度检验',
        '多模态质性编码',
      ],
      worksTitle: '论文与学位论文',
      works: [
        {
          label: '期刊论文（在审）',
          title:
            'Xu, X., Wang, L., & Gong, H. Digital Advocacy and Identity Performance: Multimodal Strategies of Environmental KOLs on Weibo.',
          meta: 'Discourse, Context & Media（SSCI），在审，2026',
          desc: '独立完成大规模平台数据的采集与清洗，做分词、主题建模与情感分析，并与系统性的多模态人工编码结合；用人工编码子样本校验模型分类，报告编码者间信度。三作，负责从数据收集、分析到投稿的完整流程。',
        },
        {
          label: '硕士论文 · 杜伦大学 2025',
          title:
            'Micro-Perspectives on the Educational Achievement of Chinese Students: A Comprehensive Assessment of Family and School',
          meta: '结构方程模型 · 全国面板数据 11,644 条观测',
          desc: '用结构方程模型估计家庭层面与学校层面资源如何共同且间接地影响个体学业成就，把文化资本作为中介机制来检验，而不是假定它成立。',
        },
      ],
    },
    cv: {
      title: '简历',
      intro: '和这个页面同源：上面写过的这里都有，这里没有的不会多说。',
      downloadLabel: '下载简历',
      viewLabel: '在线查看完整简历',
      factsTitle: '速览',
      facts: [
        { k: '现在', v: '华为 · 人工智能应用开发工程师（2025.10 至今）' },
        { k: '教育', v: '杜伦大学 社会学硕士 · 南通大学 国际经济与贸易 学士' },
        { k: '方法', v: '结构方程模型 · 中介分析 · 计算文本分析 · 网络分析 · 调查设计 · 评测设计' },
        { k: '工具', v: 'Python、R、C++、SQL、Git 等' },
        { k: '语言', v: '中文（母语）· 英文（流利，杜伦英文授课硕士）' },
      ],
    },
    contact: {
      title: '联系',
      intro: '岗位、博士项目、合作，都可以直接发邮件。',
      emailLabel: '邮箱',
      linksTitle: '其他',
      links: [
        { label: 'ORCID', value: '0009-0002-6340-2325', href: ORCID_URL },
        { label: '领英', value: 'linkedin.com/in/huipeng-gong', href: LINKEDIN_URL },
      ],
      formTitle: '或者在这里留一句',
      form: {
        name: '称呼',
        email: '你的邮箱',
        message: '想说的',
        submit: '发送',
        sending: '发送中…',
        ok: '收到了，谢谢。我会尽快回。',
        fallback: '已经帮你打开邮件客户端，内容都填好了——点一下发送就行。',
        failed: '没发出去。直接发邮件给我也一样：',
      },
    },
    a11y: {
      avatarAlt: '拱慧鹏的卡通形象',
      photoAlt: '拱慧鹏的照片',
      switchLang: '切换到英文',
      skip: '跳到正文',
      mainNav: '主导航',
    },
  },

  en: {
    wordmark: 'Andy.',
    sections: SECTIONS.en,
    hero: {
      eyebrow: 'AI APPLICATION DEVELOPMENT ENGINEER · HUAWEI · SHANGHAI',
      name: 'Huipeng (Andy) Gong',
      nameEn: '',
      nameAlt: '',
      cta: 'Get in touch',
      lead: 'I build AI systems, then test them with social-science methods: is the evaluation credible, does the measure capture what it claims to, does the conclusion rest on evidence? Pipelines and agents on one side; text analysis and structural equation models on the other.',
      hint: 'Move your cursor to make me look · hover my head or hands · drag to spin me',
    },
    about: {
      title: 'What I do',
      eyebrow: 'BUILD / MEASURE / PROVE',
      pillars: [
        {
          k: '01',
          title: 'Build',
          text: 'Data collection and pipelines, retrieval, agents and local deployment. Models wired into systems that run, not left in a notebook.',
        },
        {
          k: '02',
          title: 'Measure',
          text: 'Evaluation sets, baseline comparisons, refusal and grounding. A conclusion has to bind to evidence; when the evidence is thin, "I don\'t know" is the accurate answer, not the cautious one.',
        },
        {
          k: '03',
          title: 'Prove',
          text: 'Structural equation modelling, mediation tests, agreement between model output and manual coding. First ask what a number measures, then what it means.',
        },
      ],
      bio: 'BSc in international trade, MSc in sociology, then engineering. The order looks accidental; the combination is not — I can build the pipeline and design the measurement that makes its output credible. By day I work on AI application components and human–AI interaction evaluation at Huawei; in my own time I build small tools.',
    },
    work: {
      title: 'Selected work',
      intro: 'Things that run — not proposals.',
      items: [
        {
          year: '2025',
          name: 'Droppulses',
          meta: 'Independent build · generative and multi-agent AI',
          desc: 'A system in which generative and multi-agent AI performs tasks autonomously: custom APIs integrate LLM services into live commercial platforms, with local model deployment and production integration. Interaction logs are captured to study how AI-mediated exchange shapes user decisions.',
          tags: ['Multi-agent', 'LLM APIs', 'Production'],
        },
        {
          year: '2024',
          name: 'Social listening platform',
          meta: 'Python · MySQL · NLP',
          desc: 'Real-time crawling, cleaning and classification of multi-source online data on a MySQL architecture built for incremental writes; NLP on top extracts stakeholder concerns and sentiment indicators from large-scale unstructured text, feeding firm-level quantitative analysis.',
          tags: ['Python', 'MySQL', 'NLP'],
        },
        {
          year: '2022',
          name: 'Graph neural networks for large-scale network structure',
          meta: 'CCF Big Data & Computing Intelligence Contest · ranked 9/159',
          desc: 'Multi-scale GNNs with attention modelling complex networks at node, subgraph and global level; a noise-aware contrastive module re-weights anchors to reduce the effect of supervision error; a multi-dimensional ablation framework validates each component, with classification accuracy 18% above baseline.',
          tags: ['GNNs', 'Attention', 'Ablation'],
        },
      ],
    },
    research: {
      title: 'Writing',
      intro:
        'Methodologically I move between computational text analysis and classical social statistics, whichever the question needs.',
      methodsTitle: 'Methods I use',
      methods: [
        'Structural equation modelling (R)',
        'Mediation and moderation analysis',
        'Computational text analysis (NLP, topic modelling, sentiment)',
        'Network analysis (GNNs)',
        'Survey design and instrument validation',
        'Multimodal qualitative coding',
      ],
      worksTitle: 'Publication and thesis',
      works: [
        {
          label: 'Journal article (under review)',
          title:
            'Xu, X., Wang, L., & Gong, H. Digital Advocacy and Identity Performance: Multimodal Strategies of Environmental KOLs on Weibo.',
          meta: 'Discourse, Context & Media (SSCI), under review, 2026',
          desc: 'I independently collected and cleaned large-scale platform data in Python, ran tokenisation, topic modelling and sentiment analysis, and combined that layer with systematic multimodal qualitative coding, validating automated classifications against a manually coded subsample and reporting inter-coder reliability. Third author, carrying the work from data collection through analysis to submission.',
        },
        {
          label: 'MSc dissertation · Durham University, 2025',
          title:
            'Micro-Perspectives on the Educational Achievement of Chinese Students: A Comprehensive Assessment of Family and School',
          meta: 'Structural equation modelling (R) · national panel dataset, 11,644 observations',
          desc: 'Used structural equation modelling to estimate how family-level and school-level resources jointly and indirectly shape individual achievement, testing cultural capital as a mediating mechanism rather than assuming it.',
        },
      ],
    },
    cv: {
      title: 'CV',
      intro: 'Same source as this page: everything here is in it, and it adds nothing that is not here.',
      downloadLabel: 'Download CV (PDF)',
      viewLabel: 'Read the full CV online',
      factsTitle: 'At a glance',
      facts: [
        { k: 'Now', v: 'Huawei · AI Application Development Engineer (Oct 2025 – present)' },
        {
          k: 'Education',
          v: 'MSc Sociology, Durham University · BSc International Economics and Trade, Nantong University',
        },
        {
          k: 'Methods',
          v: 'Structural equation modelling · mediation analysis · computational text analysis · network analysis · survey design · evaluation design',
        },
        { k: 'Tools', v: 'Python · R · C++ · SQL / MySQL · Git · Linux · SPSS · EViews' },
        { k: 'Languages', v: 'Chinese (native) · English (fluent, English-taught MSc)' },
      ],
    },
    contact: {
      title: 'Contact',
      intro: 'Roles, PhD projects, collaborations — email is fine.',
      emailLabel: 'Email',
      linksTitle: 'Elsewhere',
      links: [
        { label: 'ORCID', value: '0009-0002-6340-2325', href: ORCID_URL },
        { label: 'LinkedIn', value: 'linkedin.com/in/huipeng-gong', href: LINKEDIN_URL },
      ],
      formTitle: 'Or leave a line here',
      form: {
        name: 'Your name',
        email: 'Your email',
        message: 'Message',
        submit: 'Send',
        sending: 'Sending…',
        ok: 'Got it — thank you. I will reply soon.',
        fallback: 'I opened your mail app with the message filled in — just hit send.',
        failed: 'That did not go through. Email works just as well:',
      },
    },
    a11y: {
      avatarAlt: 'Cartoon avatar of Huipeng Gong',
      photoAlt: 'Photo of Huipeng Gong',
      switchLang: '切换到中文',
      skip: 'Skip to content',
      mainNav: 'Main',
    },
  },
} as const

export type Content = (typeof content)[Lang]
