import { DAY, HOUR, MINUTE } from './plans.ts'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1000) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1000 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/** 把保留时长（秒）写成「1 小时 / 7 天」这样的标签。 */
export function formatTtl(seconds: number): string {
  if (seconds % DAY === 0) return `${seconds / DAY} 天`
  if (seconds % HOUR === 0) return `${seconds / HOUR} 小时`
  if (seconds % MINUTE === 0) return `${seconds / MINUTE} 分钟`
  return `${seconds} 秒`
}

/** 距离到期还剩多久，写成「还剩 2 天 3 小时」。 */
export function formatRemaining(msLeft: number): string {
  if (msLeft <= 0) return '已过期'
  const total = Math.floor(msLeft / 1000)
  const d = Math.floor(total / DAY)
  const h = Math.floor((total % DAY) / HOUR)
  const m = Math.floor((total % HOUR) / MINUTE)
  const s = total % MINUTE
  if (d > 0) return h > 0 ? `${d} 天 ${h} 小时` : `${d} 天`
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`
  if (m > 0) return `${m} 分 ${String(s).padStart(2, '0')} 秒`
  return `${s} 秒`
}
