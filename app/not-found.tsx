import Link from 'next/link'

export default function NotFound() {
  return (
    <main>
      <div className="card empty">
        <h2>没有这个页面</h2>
        <p>链接可能已经失效，或者地址输错了。</p>
        <Link className="btn" href="/">
          回首页
        </Link>
      </div>
    </main>
  )
}
