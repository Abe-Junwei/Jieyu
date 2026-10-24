import { defineConfig } from 'vitepress'

const pagesBase = '/Jieyu/'

const zhSidebar = [
  {
    text: '使用说明',
    items: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/getting-started' },
      { text: '录音与转写', link: '/recording' },
      { text: '标注与 IGT', link: '/annotation' },
      { text: '词典', link: '/lexicon' },
      { text: '导出与建档', link: '/export' },
      { text: '协作与同步冲突', link: '/collaboration' },
      { text: '常见问题', link: '/faq' },
    ],
  },
]

/**
 * Project site base matches https://abe-junwei.github.io/Jieyu/
 * If Pages reports a different path, change `pagesBase` to that path
 * (leading and trailing slash) and rebuild.
 * Config is .mjs so the app tsconfig does not typecheck this package.
 */
export default defineConfig({
  title: '解语使用说明',
  description: '解语（Jieyu）桌面应用的使用说明。',
  lang: 'zh-CN',
  titleTemplate: ':title · 解语',
  base: pagesBase,
  srcDir: 'src',
  lastUpdated: false,
  themeConfig: {
    search: { provider: 'local' },
    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色',
    darkModeSwitchTitle: '切换到深色',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    langMenuLabel: '语言',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Abe-Junwei/Jieyu' },
    ],
    footer: {
      message: '使用者说明。开发者文档在 DeepWiki。',
      copyright: 'Copyright © 沂南灵创技术服务中心',
    },
  },
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/',
      title: '解语使用说明',
      description: '解语（Jieyu）桌面应用的使用说明。',
      themeConfig: {
        nav: [
          { text: '使用说明', link: '/' },
          { text: '快速开始', link: '/getting-started' },
          { text: '常见问题', link: '/faq' },
          { text: '开发者文档', link: 'https://deepwiki.com/Abe-Junwei/Jieyu' },
        ],
        sidebar: zhSidebar,
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      title: 'Jieyu User Guide',
      titleTemplate: ':title · Jieyu',
      description: 'User guide for Jieyu. English pages are a stub.',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: '中文', link: '/' },
          { text: 'DeepWiki', link: 'https://deepwiki.com/Abe-Junwei/Jieyu' },
        ],
        sidebar: [
          {
            text: 'English',
            items: [{ text: 'Stub', link: '/en/' }],
          },
        ],
        outline: { label: 'On this page', level: [2, 3] },
        docFooter: { prev: 'Previous', next: 'Next' },
        darkModeSwitchLabel: 'Appearance',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Return to top',
        langMenuLabel: 'Language',
        footer: {
          message: 'English stub. The guide is written in Chinese.',
          copyright: 'Copyright © 沂南灵创技术服务中心',
        },
      },
    },
  },
})
