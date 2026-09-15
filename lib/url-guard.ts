/**
 * 对用户提交的网页地址做准入校验。
 *
 * 需要说明的是威胁模型：页面是由 Cloudflare 的浏览器去抓的，不在我们自己的网络里，
 * 所以经典的「用它探测我方内网」并不成立。这里拦掉内网/回环地址，一是这些地址在
 * 对方网络里本来也渲染不出东西，二是不想让这个公开入口变成别人的探测工具。
 */

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

const MAX_URL_LENGTH = 2048

/** 私有 / 保留的 IPv4 段。 */
function isPrivateIPv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!match) return false
  const [a, b] = match.slice(1).map(Number)
  if (match.slice(1).some((part) => Number(part) > 255)) return true // 非法地址一律拒绝
  if (a === 10) return true
  if (a === 127) return true // 回环
  if (a === 0) return true
  if (a === 169 && b === 254) return true // 链路本地，含云厂商元数据端点
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // 组播与保留段
  return false
}

function isPrivateIPv6(host: string): boolean {
  const plain = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (plain === '::1' || plain === '::') return true
  if (plain.startsWith('fe80:')) return true // 链路本地
  if (/^f[cd][0-9a-f]{2}:/.test(plain)) return true // 唯一本地地址 fc00::/7
  return false
}

export function checkPageUrl(input: string): UrlCheck {
  const raw = input.trim()
  if (!raw) return { ok: false, reason: '请填一个网页地址' }
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: '地址太长了' }

  // 没写协议时按 https 补全，用户直接粘 example.com 也能用。
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, reason: '这不是一个有效的网址' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: '只支持 http 和 https 地址' }
  }
  if (url.username || url.password) {
    return { ok: false, reason: '地址里不要带用户名密码' }
  }

  const host = url.hostname.toLowerCase()
  if (!host) return { ok: false, reason: '这不是一个有效的网址' }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, reason: '不能抓取本机地址' }
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    return { ok: false, reason: '不能抓取内网地址' }
  }
  // 没有点号又不是 IP，多半是内网主机名。
  if (!host.includes('.') && !host.includes(':')) {
    return { ok: false, reason: '请填写完整的域名' }
  }

  return { ok: true, url }
}
