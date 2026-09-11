import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Vault — 临时文件中转站',
    template: '%s · Vault',
  },
  description:
    '把大图、视频、文件丢进来，立刻拿到一个短链接发出去。到期自动作废，链接同时失效，无需注册。',
  applicationName: 'Vault',
  openGraph: {
    title: 'Vault — 临时文件中转站',
    description: '上传即得短链接，到期自动作废。无需注册。',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="shell">
          <header className="masthead">
            <h1 className="wordmark">
              <a href="/">
                Vault<span className="dot">.</span>
              </a>
            </h1>
            <nav>
              <a href="/#plans">保留时长</a>
              <a href="/#how">工作方式</a>
            </nav>
          </header>

          {children}

          <footer className="site-footer">
            <span>Vault · 临时文件中转，到期自动清除</span>
            <span>请勿上传违法内容</span>
          </footer>
        </div>
      </body>
    </html>
  )
}
