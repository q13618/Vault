'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useRef, useState } from 'react'

import { formatBytes, formatTtl } from '@/lib/format'
import {
  buildBlobPath,
  hashManageSecret,
  newId,
  newManageSecret,
  newSecret,
} from '@/lib/paths'

/** 超过这个体积就走分片上传，大文件更稳、可续传。 */
const MULTIPART_THRESHOLD = 8 * 1024 * 1024

type Mode = 'file' | 'page'
type Status = 'uploading' | 'rendering' | 'done' | 'error' | 'revoked'

interface Item {
  key: string
  kind: Mode
  name: string
  /** 网页转 PDF 时记下原始地址，卡片上要显示出处。 */
  source?: string
  size: number
  status: Status
  progress: number
  id?: string
  manageSecret?: string
  expiresAt?: number
  error?: string
  qr?: string
}

interface Job {
  key: string
  file: File
  ttl: number
}

interface Props {
  maxFileBytes: number
  ttls: number[]
  defaultTtl: number
  /** 站点规范域名。为空时退回用当前访问的地址。 */
  shareOrigin?: string | null
  /** 网页转 PDF 是否可用（没配 Cloudflare 凭据时置灰并说明原因）。 */
  pageToPdfEnabled: boolean
}

const expiryFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export default function Workbench({
  maxFileBytes,
  ttls,
  defaultTtl,
  shareOrigin,
  pageToPdfEnabled,
}: Props) {
  const [mode, setMode] = useState<Mode>('file')
  const [items, setItems] = useState<Item[]>([])
  const [ttl, setTtl] = useState(defaultTtl)
  const [over, setOver] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState('')
  const [rendering, setRendering] = useState(false)

  const queue = useRef<Job[]>([])
  const draining = useRef(false)
  const ttlRef = useRef(defaultTtl)
  ttlRef.current = ttl

  const shareUrl = useCallback(
    (id: string) => `${shareOrigin || window.location.origin}/d/${id}`,
    [shareOrigin],
  )

  const manageUrl = useCallback(
    (item: Item) => `${shareUrl(item.id!)}?s=${encodeURIComponent(item.manageSecret!)}`,
    [shareUrl],
  )

  const patch = useCallback((key: string, next: Partial<Item>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...next } : item)))
  }, [])

  const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

  // ---------- 上传文件 ----------

  const runJob = useCallback(
    async ({ key, file, ttl: jobTtl }: Job) => {
      if (file.size === 0) {
        patch(key, { status: 'error', error: '这是个空文件' })
        return
      }
      if (file.size > maxFileBytes) {
        patch(key, {
          status: 'error',
          error: `超过单文件上限 ${formatBytes(maxFileBytes)}，可拆分后再传`,
        })
        return
      }

      const id = newId()
      const manageSecret = newManageSecret()
      const expiresAt = Math.floor(Date.now() / 1000) + jobTtl
      const pathname = buildBlobPath({
        id,
        expiresAt,
        secret: newSecret(),
        manageHash: await hashManageSecret(manageSecret),
        filename: file.name,
      })

      try {
        await upload(pathname, file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          contentType: file.type || 'application/octet-stream',
          multipart: file.size > MULTIPART_THRESHOLD,
          onUploadProgress: ({ percentage }) => patch(key, { progress: percentage }),
        })
        patch(key, { status: 'done', progress: 100, id, manageSecret, expiresAt })
      } catch (error) {
        patch(key, {
          status: 'error',
          error: error instanceof Error ? error.message : '上传失败，请重试',
        })
      }
    },
    [maxFileBytes, patch],
  )

  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    try {
      let job = queue.current.shift()
      while (job) {
        await runJob(job)
        job = queue.current.shift()
      }
    } finally {
      draining.current = false
    }
  }, [runJob])

  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      const list = Array.from(files ?? [])
      if (list.length === 0) return
      const jobs: Job[] = list.map((file) => ({ key: newKey(), file, ttl: ttlRef.current }))
      setItems((prev) => [
        ...jobs.map(({ key, file }) => ({
          key,
          kind: 'file' as Mode,
          name: file.name,
          size: file.size,
          status: 'uploading' as Status,
          progress: 0,
        })),
        ...prev,
      ])
      queue.current.push(...jobs)
      void drain()
    },
    [drain],
  )

  // ---------- 网页转 PDF ----------

  const submitPage = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const target = pageUrl.trim()
      if (!target || rendering) return

      const key = newKey()
      setItems((prev) => [
        {
          key,
          kind: 'page',
          name: target,
          source: target,
          size: 0,
          status: 'rendering',
          progress: 0,
        },
        ...prev,
      ])
      setPageUrl('')
      setRendering(true)

      try {
        const response = await fetch('/api/pdf', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: target, ttl: ttlRef.current }),
        })
        const data = (await response.json()) as {
          id?: string
          manageSecret?: string
          expiresAt?: number
          filename?: string
          size?: number
          error?: string
        }
        if (!response.ok || !data.id) {
          patch(key, { status: 'error', error: data.error ?? '渲染失败，请重试' })
          return
        }
        patch(key, {
          status: 'done',
          progress: 100,
          id: data.id,
          manageSecret: data.manageSecret,
          expiresAt: data.expiresAt,
          name: data.filename ?? 'page.pdf',
          size: data.size ?? 0,
        })
      } catch {
        patch(key, { status: 'error', error: '网络异常，请重试' })
      } finally {
        setRendering(false)
      }
    },
    [pageUrl, rendering, patch],
  )

  // ---------- 结果卡片上的动作 ----------

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 剪贴板被拒时退回到旧接口，够用就行。
      const field = document.createElement('textarea')
      field.value = text
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.append(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopied(key)
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600)
  }, [])

  const toggleQr = useCallback(
    async (item: Item) => {
      if (item.qr) {
        patch(item.key, { qr: undefined })
        return
      }
      const { toDataURL } = await import('qrcode')
      const dataUrl = await toDataURL(shareUrl(item.id!), { margin: 1, width: 336 })
      patch(item.key, { qr: dataUrl })
    },
    [patch, shareUrl],
  )

  const revoke = useCallback(
    async (item: Item) => {
      if (!item.id || !item.manageSecret) return
      const response = await fetch(
        `/api/f/${item.id}/delete?s=${encodeURIComponent(item.manageSecret)}`,
        { method: 'POST' },
      )
      if (response.ok) {
        patch(item.key, { status: 'revoked' })
      } else {
        patch(item.key, { error: '撤回失败，可能已经被清除了' })
      }
    },
    [patch],
  )

  return (
    <div>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'file'}
          onClick={() => setMode('file')}
        >
          发文件
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'page'}
          onClick={() => setMode('page')}
        >
          存网页
        </button>
      </div>

      {mode === 'file' ? (
        <label
          className="dropzone"
          data-over={over}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            addFiles(event.dataTransfer?.files ?? null)
          }}
        >
          <svg className="glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <strong>把文件拖到这里，或点击选择</strong>
          <span>单文件最大 {formatBytes(maxFileBytes)} · 可一次选多个 · 无需注册</span>
          <input
            type="file"
            multiple
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
      ) : pageToPdfEnabled ? (
        <form className="urlform" onSubmit={submitPage}>
          <svg className="glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9.5 14.5 14.5 9.5M10.5 7.5l1.2-1.2a3.7 3.7 0 0 1 5.2 5.2l-1.2 1.2M13.5 16.5l-1.2 1.2a3.7 3.7 0 0 1-5.2-5.2l1.2-1.2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <strong>把网页存成 PDF</strong>
          <span>贴一个网址，渲染好的 PDF 一样给你一条到期作废的短链接</span>
          <div className="urlrow">
            <input
              type="text"
              inputMode="url"
              placeholder="example.com/article"
              value={pageUrl}
              onChange={(event) => setPageUrl(event.target.value)}
              disabled={rendering}
              aria-label="网页地址"
            />
            <button type="submit" className="btn btn-primary" disabled={rendering || !pageUrl.trim()}>
              {rendering ? '渲染中…' : '生成 PDF'}
            </button>
          </div>
          <span className="hint">
            重页面可能要等十几秒。有登录墙或人机验证的页面渲染不出来。
          </span>
        </form>
      ) : (
        <div className="notice">
          <strong>网页转 PDF 还没配置。</strong> 需要在 Vercel 项目里设置{' '}
          <code>CLOUDFLARE_ACCOUNT_ID</code> 与 <code>CLOUDFLARE_API_TOKEN</code>，重新部署后即可使用。
        </div>
      )}

      <div className="controls">
        <span className="label">保留</span>
        <div className="segmented" role="group" aria-label="保留时长">
          {ttls.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === ttl}
              onClick={() => setTtl(value)}
            >
              {formatTtl(value)}
            </button>
          ))}
        </div>
        <span className="label" style={{ color: 'var(--ink-3)' }}>
          到期后文件与链接同时作废
        </span>
      </div>

      {items.length > 0 && (
        <ul className="queue">
          {items.map((item) => (
            <li className="item" key={item.key}>
              <div className="item-head">
                <span className="item-name" title={item.name}>
                  {item.name}
                </span>
                <span className="item-meta">
                  {item.status === 'uploading' && `${Math.round(item.progress)}%`}
                  {item.status === 'rendering' && '渲染中…'}
                  {item.status === 'done' &&
                    item.expiresAt &&
                    `${formatBytes(item.size)} · ${expiryFormatter.format(item.expiresAt * 1000)} 到期`}
                  {item.status === 'revoked' && '已撤回'}
                  {item.status === 'error' && '未完成'}
                </span>
              </div>

              {item.kind === 'page' && item.source && item.status === 'done' && (
                <p className="item-source" title={item.source}>
                  来自 {item.source}
                </p>
              )}

              {item.status === 'uploading' && (
                <div className="track">
                  <i style={{ width: `${Math.max(2, item.progress)}%` }} />
                </div>
              )}
              {item.status === 'rendering' && (
                <div className="track" data-indeterminate="true">
                  <i />
                </div>
              )}

              {item.error && <p className="item-error">{item.error}</p>}

              {item.status === 'done' && item.id && (
                <>
                  <div className="linkrow">
                    <input readOnly value={shareUrl(item.id)} onFocus={(e) => e.target.select()} />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => copy(item.key, shareUrl(item.id!))}
                    >
                      {copied === item.key ? '已复制' : '复制'}
                    </button>
                  </div>
                  <div className="item-actions">
                    <button type="button" className="btn btn-quiet" onClick={() => toggleQr(item)}>
                      {item.qr ? '收起二维码' : '二维码'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => copy(`${item.key}:manage`, manageUrl(item))}
                    >
                      {copied === `${item.key}:manage` ? '已复制管理链接' : '复制管理链接'}
                    </button>
                    <span className="spacer" />
                    <button
                      type="button"
                      className="btn btn-quiet btn-danger"
                      onClick={() => revoke(item)}
                    >
                      立即撤回
                    </button>
                  </div>
                  {item.qr && (
                    <div className="qr">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.qr} alt={`${item.name} 的下载二维码`} />
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
