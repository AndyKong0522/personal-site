// 网站文案（中 / 英）。
//
// 事实来源：Andy_Work 工作区（cv/master_cv_en.md 的"已确认的事实基线"、
// applications/、positions/、tracker/README.md）。
// 规则：只写真实内容；不确定的一律标【待确认】并当面问，不从别的版本照搬。
// 隐私：不放手机号、住址；联系方式只有工作邮箱 + LinkedIn / GitHub。

export type Lang = 'zh' | 'en'

/** 展示标题固定用英文（字体只有拉丁字形；参考图也是英文大字 + 中文小字）。 */
export const DISPLAY_LINES = ['AI WITH', 'A SOCIAL', 'MIND.'] as const

type SectionMeta = { id: string; index: string; nav: string; label: string }

const SECTIONS: Record<Lang, SectionMeta[]> = {
  zh: [
    { id: 'top', index: '01', nav: '初次见面', label: '初次见面' },
    { id: 'about', index: '02', nav: '关于', label: '关于我' },
    { id: 'projects', index: '03', nav: '项目', label: '项目' },
    { id: 'research', index: '04', nav: '研究', label: '研究' },
    { id: 'contact', index: '05', nav: '联系', label: '联系' },
  ],
  en: [
    { id: 'top', index: '01', nav: 'Intro', label: 'Intro' },
    { id: 'about', index: '02', nav: 'About', label: 'About' },
    { id: 'projects', index: '03', nav: 'Projects', label: 'Projects' },
    { id: 'research', index: '04', nav: 'Research', label: 'Research' },
    { id: 'contact', index: '05', nav: 'Contact', label: 'Contact' },
  ],
}

export const EMAIL = 'andykong.work@outlook.com'

export const content = {
  zh: {
    wordmark: '慧鹏.',
    sections: SECTIONS.zh,
    hero: {
      eyebrow: '拱慧鹏 / 社会学 × AI',
      role: 'AI 应用开发工程师',
      roleSub: '一个好奇的头脑。一个更大的问题。',
      greeting: '嗨，我是慧鹏。',
      lead: '把社会学的问题意识，做成能跑的 AI 系统。',
      cta: '先认识我，再看项目',
      sideTitle: '数据要有意义。',
      sideLines: [
        '我用计算方法研究人和平台如何互相塑造。',
        '也把模型真正部署进生产系统。',
        '每种方法都想知道：它为什么成立。',
      ],
      blurb: '我关心的是技术背后的社会机制。喜欢拆解问题，也喜欢把答案做成别人能用的东西。',
      scroll: '向下滚动',
      hint: '移动鼠标我会看你 · 悬停头部或手试试 · 按住可拖动',
    },
    about: {
      title: '关于我',
      eyebrow: '社会学训练 × 工程实践',
      intro:
        '社会学训练出身，用计算方法和 AI 做事。杜伦大学社会学硕士（Merit），本科在南通大学读国际经济与贸易。现在在华为做 AI 应用开发，同时独立经营 Droppulses——一个把生成式 AI 与多智能体系统接进真实电商链路的项目。',
      timelineTitle: '经历',
    },
    timeline: [
      {
        time: '2018.09 – 2023.06',
        title: '南通大学 · 国际经济与贸易 本科',
        text: 'GPA 85/100。毕业论文用时间序列回归，估计政策不确定性对贸易结构的影响。',
      },
      {
        time: '2020.06 – 2020.09',
        title: '华泰证券（泰州）· 软件开发实习',
        text: '用 Python 开发客户风险测评模块，把风险偏好问卷的评分与产品匹配逻辑自动化；另用 Django 搭了一个金融产品信息系统。',
      },
      {
        time: '2021.06 – 2022.01',
        title: '商汤科技 · 软件开发实习',
        text: '参与智慧交通系统原型，用 Flask 把交通流量预测模型封装成 RESTful API；另做了一套客户分群与标签看板。',
      },
      {
        time: '2023.09 – 2025.01',
        title: '杜伦大学 · 社会学硕士（英文授课）',
        text: 'Merit。硕士论文用 R 做结构方程模型，在全国面板数据（11,644 条观测）上估计家庭与学校资源如何共同、间接地影响学业成就。',
      },
      {
        time: '2024.06 – 2025.03',
        title: '瓦琉 · 数据分析实习',
        text: '用 Python 搭社交媒体监听平台，设计 MySQL 架构做多源数据的实时抓取、清洗与分类，并用 NLP 从非结构化文本里提取利益相关方关切与情感指标。',
      },
      {
        time: '2025.06 – 至今',
        title: 'Droppulses · 创始人',
        text: '独立开发并运营一套由生成式 AI 与多智能体自主执行任务的系统，自建 API 把大模型服务接进 Shopify 等真实商业平台。',
      },
      {
        time: '2025.10 – 至今',
        title: '华为 · AI 应用开发工程师',
        text: '用 Python 和 C++ 开发 AI 应用组件，搭建多模态人机交互的数据管线与评测基准，并把模型能力部署进生产系统。',
      },
    ],
    projects: {
      title: '项目',
      intro: '以下都是在做的事，不是设想。',
      items: [
        {
          name: 'Droppulses',
          meta: '2025.06 – 至今 · 独立开发与运营',
          desc: '一套由生成式 AI 和多智能体自主执行任务的系统。自建 API 把大模型服务接进 Shopify 等真实商业平台，完成本地模型部署与生产环境集成，并持续分析交互日志，观察 AI 中介的交流如何影响用户决策。',
          tags: ['多智能体', 'LLM API', '本地部署', '生产环境'],
        },
        {
          name: '博士岗位追踪系统',
          meta: '2026 · 自用工具',
          desc: '每天 09:00 自动抓取在招博士岗位，按自定义画像打分筛选，生成可视化面板。抓服务端渲染数据，纯 HTTP、不需要无头浏览器；核心是一套带回归测试（12 条用例）的硬性排除规则，并对通过初筛的岗位再抓详情页复核——因为列表摘要只有几十个字符，真正卡人的要求全写在详情页里。',
          tags: ['Node.js', '规则引擎', '回归测试', 'Windows 计划任务'],
        },
        {
          name: '社交媒体监听平台',
          meta: '2024.06 – 2025.03 · 瓦琉实习期间',
          desc: '用 Python 实现的自动化监听平台，MySQL 架构支撑多源在线数据的实时抓取、清洗与分类；在其上用 NLP 从大规模非结构化文本中提取利益相关方关切与情感指标，服务于对企业层面的量化分析。',
          tags: ['Python', 'MySQL', 'NLP', '数据管线'],
        },
        {
          name: '大规模网络结构的图神经网络建模',
          meta: '2022 · CCF 大数据与计算智能大赛 · 9/159',
          desc: '构建带注意力机制的多尺度图神经网络，在节点、子图和全图三个层面建模复杂网络结构；引入噪声感知的对比模块，动态重加权锚点以降低监督误差的影响；设计多维度消融框架逐项验证，分类准确率相比基线提升 18%。',
          tags: ['图神经网络', '注意力机制', '消融实验'],
        },
      ],
    },
    research: {
      title: '研究',
      intro:
        '关心数字平台上的话语与身份、AI 与大型语言模型的社会后果，以及算法如何进入决策。方法上在计算文本分析与经典社会统计之间来回走。',
      interestsTitle: '研究兴趣',
      interests: [
        '数字平台与在线话语',
        'AI 与大语言模型的社会研究',
        '生成式与智能体 AI',
        '计算社会科学',
        '算法治理与自动化决策',
      ],
      worksTitle: '论文与学位论文',
      works: [
        {
          label: '期刊论文（在审）',
          title:
            'Xu, X., Wang, L., & Gong, H. Digital Advocacy and Identity Performance: Multimodal Strategies of Environmental KOLs on Weibo.',
          meta: 'Discourse, Context & Media（SSCI），under review，2026',
          desc: '独立完成大规模平台数据的采集与清洗（Python），做分词、主题建模与情感分析，并与系统性的多模态人工编码结合；用人工编码子样本校验模型分类，报告编码者间信度。三作，负责从数据收集、分析到投稿的完整流程。',
        },
        {
          label: '硕士论文 · 杜伦大学 2025',
          title: 'Micro-Perspectives on the Educational Achievement of Chinese Students: A Comprehensive Assessment of Family and School',
          meta: '结构方程模型（R）· 全国面板数据 11,644 条观测',
          desc: '用结构方程模型估计家庭层面与学校层面资源如何共同且间接地影响个体学业成就，把文化资本作为中介机制来检验，而不是假定它成立。',
        },
      ],
    },
    contact: {
      title: '联系',
      intro: '欢迎就 AI 应用岗位、博士项目或合作联系我。',
      emailLabel: '邮箱',
      linksTitle: '其他',
    },
    a11y: {
      avatarAlt: '拱慧鹏的卡通形象',
      switchLang: 'Switch to English',
      skip: '跳到正文',
      mainNav: '主导航',
    },
  },

  en: {
    wordmark: 'Huipeng.',
    sections: SECTIONS.en,
    hero: {
      eyebrow: 'HUIPENG GONG / SOCIOLOGY & AI',
      role: 'AI Application Development Engineer',
      roleSub: 'A curious mind. A larger question.',
      greeting: "Hi, I'm Huipeng.",
      lead: 'I turn sociological questions into AI systems that actually run.',
      cta: 'Meet me first, then the work',
      sideTitle: 'DATA WITH MEANING.',
      sideLines: [
        'I use computational methods to study how people and platforms shape each other.',
        'I also ship models into production systems.',
        'And I want to know why each method works.',
      ],
      blurb: "I care about the social mechanisms behind the technology. I like taking problems apart, and I like turning the answers into things other people can use.",
      scroll: 'Scroll to explore',
      hint: 'Move your cursor to make me look · hover my head or hands · drag to spin me',
    },
    about: {
      title: 'About',
      eyebrow: 'SOCIOLOGICAL TRAINING × ENGINEERING PRACTICE',
      intro:
        'A sociologist by training who works with computational methods and AI. MSc in Sociology (Merit) from Durham University; BSc in International Economics and Trade from Nantong University. I currently work as an AI Application Development Engineer at Huawei and independently run Droppulses, a venture that puts generative and agentic AI into a live commercial loop.',
      timelineTitle: 'Trajectory',
    },
    timeline: [
      {
        time: 'Sep 2018 – Jun 2023',
        title: 'Nantong University · BSc, International Economics and Trade',
        text: 'GPA 85/100. Thesis built a time-series regression in EViews on two decades of official trade data to estimate the effect of policy uncertainty on trade structure.',
      },
      {
        time: 'Jun 2020 – Sep 2020',
        title: 'Huatai Securities (Taizhou) · Software Development Intern',
        text: 'Co-developed a client risk-assessment module in Python, automating the scoring of risk-preference questionnaires and product-matching logic; designed a financial product information system in Django.',
      },
      {
        time: 'Jun 2021 – Jan 2022',
        title: 'SenseTime · Software Development Intern',
        text: 'Contributed to an AI smart-traffic prototype, deploying traffic-flow prediction models as RESTful APIs via Flask; built a customer segmentation and tagging system with dashboards.',
      },
      {
        time: 'Sep 2023 – Jan 2025',
        title: 'Durham University · MSc in Sociology (English-taught)',
        text: 'Merit. Dissertation applied structural equation modelling in R to a national panel dataset of 11,644 observations, modelling how family-level and school-level resources jointly and indirectly shape achievement.',
      },
      {
        time: 'Jun 2024 – Mar 2025',
        title: 'Value Enterprise Management Consulting · Data Analysis Intern',
        text: 'Built an automated social-listening platform in Python and designed a MySQL architecture for real-time crawling, cleaning and classification of multi-source online data; applied NLP to extract stakeholder concerns and sentiment at scale.',
      },
      {
        time: 'Jun 2025 – present',
        title: 'Droppulses · Founder',
        text: 'Built and operate a system in which generative and multi-agent AI performs tasks autonomously, developing custom APIs to integrate LLM services into live commercial platforms such as Shopify.',
      },
      {
        time: 'Oct 2025 – present',
        title: 'Huawei · AI Application Development Engineer',
        text: 'Develop AI-driven application components in Python and C++, build data pipelines and evaluation benchmarks for multimodal human–AI interaction, and deploy AI capabilities into production systems.',
      },
    ],
    projects: {
      title: 'Projects',
      intro: 'Things I have built and still run — not proposals.',
      items: [
        {
          name: 'Droppulses',
          meta: 'Jun 2025 – present · Independent',
          desc: 'A system in which generative and multi-agent AI performs tasks autonomously. I develop custom APIs to integrate LLM services into live commercial platforms such as Shopify, completed local model deployment and production integration, and collect interaction logs on how AI-mediated exchange shapes user decisions.',
          tags: ['Multi-agent', 'LLM APIs', 'Local deployment', 'Production'],
        },
        {
          name: 'PhD position tracker',
          meta: '2026 · Personal tooling',
          desc: 'Scrapes open doctoral positions every morning at 09:00, scores them against a custom profile and renders a visual dashboard. It reads server-rendered payloads over plain HTTP with no headless browser; the core is a rule engine of hard exclusion criteria (language, standardised tests, methodological orientation) with a regression test suite of 12 cases, followed by detail-page re-checks for shortlisted posts — because listing teasers run to a few dozen characters while the requirements that actually disqualify you sit in the detail page.',
          tags: ['Node.js', 'Rule engine', 'Regression tests', 'Scheduled task'],
        },
        {
          name: 'Social listening platform',
          meta: 'Jun 2024 – Mar 2025 · during internship at Value',
          desc: 'An automated monitoring platform in Python with a MySQL architecture supporting real-time crawling, cleaning and classification of multi-source online data. On top of it, NLP extracted stakeholder concerns and sentiment indicators from large-scale unstructured text, feeding firm-level quantitative analysis.',
          tags: ['Python', 'MySQL', 'NLP', 'Data pipelines'],
        },
        {
          name: 'Graph neural networks for large-scale network structure',
          meta: '2022 · CCF Big Data & Computing Intelligence Contest · ranked 9/159',
          desc: 'Built multi-scale graph neural networks with attention to model complex networks at node, subgraph and global level; introduced a noise-aware contrastive module that dynamically re-weighted anchors to reduce the effect of supervision error; designed a multi-dimensional ablation framework, improving classification accuracy by 18% over the baseline.',
          tags: ['GNNs', 'Attention', 'Ablation'],
        },
      ],
    },
    research: {
      title: 'Research',
      intro:
        'I work on discourse and identity on digital platforms, the social consequences of AI and large language models, and how algorithms enter decision-making. Methodologically I move between computational text analysis and classical social statistics.',
      interestsTitle: 'Interests',
      interests: [
        'Digital platforms and online discourse',
        'The societal study of AI and LLMs',
        'Generative and agentic AI',
        'Computational social science',
        'Algorithmic governance and automated decision-making',
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
          title: 'Micro-Perspectives on the Educational Achievement of Chinese Students: A Comprehensive Assessment of Family and School',
          meta: 'Structural equation modelling (R) · national panel dataset, 11,644 observations',
          desc: 'Used structural equation modelling to estimate how family-level and school-level resources jointly and indirectly shape individual achievement, testing cultural capital as a mediating mechanism rather than assuming it.',
        },
      ],
    },
    contact: {
      title: 'Contact',
      intro: 'Open to AI application roles, doctoral positions and collaborations.',
      emailLabel: 'Email',
      linksTitle: 'Elsewhere',
    },
    a11y: {
      avatarAlt: 'Cartoon avatar of Huipeng Gong',
      switchLang: '切换到中文',
      skip: 'Skip to content',
      mainNav: 'Main',
    },
  },
} as const

export type Content = (typeof content)[Lang]
