import { NextResponse } from 'next/server'

import { findById } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * 分享链接的实际出口：把 id 换成一次性的 Blob 直链并 302 过去。
 *
 * 这样做既不用把大文件塞进 Serverless 函数转发，又保证过期判断永远在我们手里。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const file = await findById(id)

  if (!file) {
    return NextResponse.json({ error: '链接不存在或文件已被清除' }, { status: 404, headers: NO_STORE })
  }
  if (file.expired) {
    return NextResponse.json({ error: '链接已过期' }, { status: 410, headers: NO_STORE })
  }

  const inline = new URL(request.url).searchParams.get('inline') === '1'
  return NextResponse.redirect(inline ? file.url : file.downloadUrl, {
    status: 302,
    headers: NO_STORE,
  })
}
