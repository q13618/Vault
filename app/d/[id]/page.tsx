import type { Metadata } from 'next'
import Link from 'next/link'

import Countdown from '@/components/countdown'
import ManageActions from '@/components/manage-actions'
import { formatBytes } from '@/lib/format'
import { hashManageSecret } from '@/lib/paths'
import { previewKind } from '@/lib/preview'
import { findById } from '@/lib/store'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ s?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const file = await findById(id)
  return {
    title: file && !file.expired ? file.filename : '链接已失效',
    // 分享出去的文件不该被搜索引擎收录。
    robots: { index: false, follow: false },
  }
}

export default async function DownloadPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { s } = await searchParams
  const file = await findById(id)

  if (!file || file.expired) {
    return (
      <main>
        <div className="card empty">
          <h2>{file?.expired ? '这个链接已经过期了' : '链接不存在'}</h2>
          <p>
            {file?.expired
              ? '文件已按上传者设定的时间作废，随后会从存储中彻底删除。'
              : '可能是链接输错了，或者文件已经被撤回。'}
          </p>
          <Link className="btn" href="/">
            去传一个文件
          </Link>
        </div>
      </main>
    )
  }

  const kind = previewKind(file.filename)
  const inlineUrl = `/api/download/${file.id}?inline=1`
  const isOwner = Boolean(s) && (await hashManageSecret(s!)) === file.manageHash

  return (
    <main>
      <div className="card filecard">
        <p className="eyebrow">有人给你发了一个文件</p>
        <h2 className="fname">{file.filename}</h2>
        <p className="fmeta">
          {formatBytes(file.size)} · <Countdown expiresAt={file.expiresAt} />
        </p>
        <div className="actions">
          <a className="btn btn-primary" href={`/api/download/${file.id}`}>
            下载
          </a>
          {kind !== 'none' && (
            <a className="btn" href={inlineUrl} target="_blank" rel="noreferrer">
              在新窗口打开
            </a>
          )}
        </div>

        {kind === 'image' && (
          <div className="preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={inlineUrl} alt={file.filename} />
          </div>
        )}
        {kind === 'video' && (
          <div className="preview">
            <video src={inlineUrl} controls preload="metadata" />
          </div>
        )}
        {kind === 'audio' && (
          <div className="preview">
            <audio src={inlineUrl} controls preload="metadata" />
          </div>
        )}

        {isOwner && <ManageActions id={file.id} manageSecret={s!} />}
      </div>

      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 18, textAlign: 'center' }}>
        到期后这个页面会自动失效 ——{' '}
        <Link href="/" style={{ borderBottom: '1px solid var(--line-strong)' }}>
          Vault
        </Link>{' '}
        是个临时中转站，请及时保存。
      </p>
    </main>
  )
}
