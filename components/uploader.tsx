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

type Status = 'uploading' | 'done' | 'error' | 'revoked'

interface Item {
  key: string
  name: string
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
}

const expiryFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export default function Uploader({ maxFileBytes, ttls, defaultTtl }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [ttl, setTtl] = useState(defaultTtl)
  const [over, setOver] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const queue = useRef<Job[]>([])
  const draining = useRef(false)
  const ttlRef = useRef(defaultTtl)
  ttlRef.current = ttl

  const patch = useCallback((key: string, next: Partial<Item>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...next } : item)))
  }, [])

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
      const jobs: Job[] = list.map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        ttl: ttlRef.current,
      }))
      setItems((prev) => [
        ...jobs.map(({ key, file }) => ({
          key,
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
    [patch],
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
        <span>
          单文件最大 {formatBytes(maxFileBytes)} · 可一次选多个 · 无需注册
        </span>
        <input
          type="file"
          multiple
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </label>

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
                  {item.status === 'done' &&
                    item.expiresAt &&
                    `${formatBytes(item.size)} · ${expiryFormatter.format(item.expiresAt * 1000)} 到期`}
                  {item.status === 'revoked' && '已撤回'}
                  {item.status === 'error' && '未完成'}
                </span>
              </div>

              {item.status === 'uploading' && (
                <div className="track">
                  <i style={{ width: `${Math.max(2, item.progress)}%` }} />
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

function shareUrl(id: string): string {
  return `${window.location.origin}/d/${id}`
}

function manageUrl(item: Item): string {
  return `${shareUrl(item.id!)}?s=${encodeURIComponent(item.manageSecret!)}`
}
