import { NextResponse } from 'next/server'

import { isAuthorizedCronRequest } from '@/lib/cron-auth'
import { reapExpired } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 定时清理已过期的文件（见 vercel.json 里的 crons）。
 *
 * 下载入口本身就会拒绝过期链接，所以这里只是回收存储空间。
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await reapExpired()
  return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
}
