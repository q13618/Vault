/**
 * Blob 对象的路径约定 —— 整个服务的「数据库」。
 *
 *   f/<id>/<expiresAtSeconds>/<secret>/<manageHash>/<encodedFilename>
 *
 * 到期时间、原始文件名、撤回凭据全部编码在对象路径里，所以这个服务
 * 不需要任何数据库：下载时用 `f/<id>/` 做前缀查询就能还原全部元信息。
 *
 * - `id`         —— 出现在分享链接 `/d/<id>` 里，10 位，短到可以发微信。
 * - `secret`     —— 12 位随机段，只存在于 Blob 路径中、不出现在分享链接里，
 *                   因此别人拿到 id 也猜不出 Blob 直链，过期校验只能走我们的入口。
 * - `manageHash` —— 撤回口令的哈希。口令本身只有上传者持有，
 *                   所以即便有人翻出了 Blob 直链，也无法提前删除别人的文件。
 */

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789' // 去掉易混淆的 l / 1 / 0
export const ID_LENGTH = 10
export const SECRET_LENGTH = 12
export const MANAGE_SECRET_LENGTH = 16
export const MANAGE_HASH_LENGTH = 16
export const MAX_ENCODED_FILENAME_LENGTH = 240

export const ID_PATTERN = new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`)

function randomString(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
  return out
}

export function newId(): string {
  return randomString(ID_LENGTH)
}

export function newSecret(): string {
  return randomString(SECRET_LENGTH)
}

export function newManageSecret(): string {
  return randomString(MANAGE_SECRET_LENGTH)
}

/** 撤回口令 → 路径里存的哈希。浏览器与服务端用的是同一套 Web Crypto。 */
export async function hashManageSecret(manageSecret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(manageSecret))
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '').slice(0, MANAGE_HASH_LENGTH)
}

export function isValidId(value: string): boolean {
  return ID_PATTERN.test(value)
}

/** 去掉目录分隔符与控制字符，保留中文等原始字符。 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return cleaned.slice(0, 120) || 'file'
}

export interface BlobPathParts {
  id: string
  /** 到期时间，Unix 秒 */
  expiresAt: number
  secret: string
  manageHash: string
  filename: string
}

export function buildBlobPath(parts: BlobPathParts): string {
  const filename = encodeURIComponent(sanitizeFilename(parts.filename))
  return `f/${parts.id}/${parts.expiresAt}/${parts.secret}/${parts.manageHash}/${filename}`
}

export function prefixForId(id: string): string {
  return `f/${id}/`
}

export function parseBlobPath(pathname: string): BlobPathParts | null {
  const match = /^f\/([^/]+)\/(\d{1,12})\/([^/]+)\/([^/]+)\/(.+)$/.exec(pathname)
  if (!match) return null
  const [, id, expiresAt, secret, manageHash, encodedFilename] = match
  if (!isValidId(id)) return null
  if (secret.length !== SECRET_LENGTH) return null
  if (manageHash.length !== MANAGE_HASH_LENGTH) return null
  if (encodedFilename.length > MAX_ENCODED_FILENAME_LENGTH) return null
  let filename: string
  try {
    filename = decodeURIComponent(encodedFilename)
  } catch {
    filename = encodedFilename
  }
  return {
    id,
    expiresAt: Number.parseInt(expiresAt, 10),
    secret,
    manageHash,
    filename: sanitizeFilename(filename),
  }
}
