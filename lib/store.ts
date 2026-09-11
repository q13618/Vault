import { del, list } from '@vercel/blob'

import { isValidId, parseBlobPath, prefixForId, type BlobPathParts } from './paths.ts'

/** 过期后再宽限一小会儿才真正删除，避免时钟误差把正在下载的文件删掉。 */
export const REAP_GRACE_SECONDS = 120

export interface StoredFile extends BlobPathParts {
  /** Blob 直链（仅服务端使用，不下发给访问者） */
  url: string
  /** 带 `?download=1` 的直链，浏览器会另存为而不是内联打开 */
  downloadUrl: string
  size: number
  uploadedAt: string
  expired: boolean
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

function toStoredFile(blob: {
  pathname: string
  url: string
  downloadUrl?: string
  size: number
  uploadedAt: Date | string
}): StoredFile | null {
  const parts = parseBlobPath(blob.pathname)
  if (!parts) return null
  return {
    ...parts,
    url: blob.url,
    downloadUrl: blob.downloadUrl ?? `${blob.url}?download=1`,
    size: blob.size,
    uploadedAt: new Date(blob.uploadedAt).toISOString(),
    expired: parts.expiresAt * 1000 <= Date.now(),
  }
}

/** 按分享链接里的 id 查回文件。找不到或已过期都会在返回值里体现。 */
export async function findById(id: string): Promise<StoredFile | null> {
  if (!isValidId(id) || !blobConfigured()) return null
  const { blobs } = await list({ prefix: prefixForId(id), limit: 2 })
  for (const blob of blobs) {
    const file = toStoredFile(blob)
    if (file && file.id === id) return file
  }
  return null
}

export async function deleteById(id: string): Promise<boolean> {
  const file = await findById(id)
  if (!file) return false
  await del(file.url)
  return true
}

export interface ReapResult {
  scanned: number
  deleted: number
  unparsable: number
}

/** 扫描全部对象，删除已过期（含宽限期）的文件。由 Vercel Cron 定时调用。 */
export async function reapExpired(now = Date.now()): Promise<ReapResult> {
  const cutoff = Math.floor(now / 1000) - REAP_GRACE_SECONDS
  const result: ReapResult = { scanned: 0, deleted: 0, unparsable: 0 }
  if (!blobConfigured()) return result

  let cursor: string | undefined
  do {
    const page = await list({ prefix: 'f/', limit: 500, cursor })
    const doomed: string[] = []
    for (const blob of page.blobs) {
      result.scanned += 1
      const parts = parseBlobPath(blob.pathname)
      if (!parts) {
        result.unparsable += 1
        continue
      }
      if (parts.expiresAt <= cutoff) doomed.push(blob.url)
    }
    if (doomed.length > 0) {
      await del(doomed)
      result.deleted += doomed.length
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)

  return result
}
