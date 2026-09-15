import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'

import { pageFilename } from '@/lib/page-name'
import { buildBlobPath, hashManageSecret, newId, newManageSecret, newSecret } from '@/lib/paths'
import { maxTtl, resolvePlan } from '@/lib/plans'
import { getRenderer, RenderError, rendererConfigured } from '@/lib/render'
import { blobConfigured } from '@/lib/store'
import { checkPageUrl } from '@/lib/url-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 留给渲染的预算，剩下的时间用来把 PDF 写进对象存储。 */
const RENDER_BUDGET_MS = 45_000

/**
 * 把一个网页渲染成 PDF，存进和上传文件同一套通道。
 *
 * 产物走的是完全相同的路径约定，所以到期作废、提前撤回、短链分享这些
 * 全部自动复用第一步的实现，这里不需要任何额外状态。
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!rendererConfigured()) {
    return NextResponse.json(
      { error: '网页转 PDF 还没配置：需要在项目里设置 CLOUDFLARE_ACCOUNT_ID 与 CLOUDFLARE_API_TOKEN。' },
      { status: 503 },
    )
  }
  if (!blobConfigured()) {
    return NextResponse.json({ error: '存储未配置，无法保存渲染结果。' }, { status: 503 })
  }

  let body: { url?: unknown; ttl?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 })
  }

  const check = checkPageUrl(typeof body.url === 'string' ? body.url : '')
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 })
  }

  const plan = resolvePlan(request)
  const ttl = Number(body.ttl)
  if (!Number.isFinite(ttl) || ttl < 60 || ttl > maxTtl(plan)) {
    return NextResponse.json({ error: '保留时长不在允许范围内' }, { status: 400 })
  }

  const renderer = getRenderer()
  if (!renderer) {
    return NextResponse.json({ error: '渲染服务不可用' }, { status: 503 })
  }

  let pdf: Uint8Array
  try {
    pdf = await renderer.renderPdf(check.url.toString(), {
      signal: AbortSignal.timeout(RENDER_BUDGET_MS),
    })
  } catch (error) {
    if (error instanceof RenderError) {
      // 渲染失败是常态（登录墙、反爬、超时），不是我们的 bug，给用户一句人话。
      console.error('render failed', { url: check.url.hostname, detail: error.message })
      return NextResponse.json({ error: error.userMessage }, { status: 502 })
    }
    throw error
  }

  if (pdf.byteLength > plan.maxFileBytes) {
    return NextResponse.json({ error: '渲染出来的 PDF 超过了单文件上限' }, { status: 413 })
  }

  const id = newId()
  const manageSecret = newManageSecret()
  const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(ttl)
  const filename = pageFilename(check.url)

  await put(
    buildBlobPath({
      id,
      expiresAt,
      secret: newSecret(),
      manageHash: await hashManageSecret(manageSecret),
      filename,
    }),
    // 渲染器返回的是 Web 标准的 Uint8Array，Blob SDK 要 Buffer。
    Buffer.from(pdf),
    {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/pdf',
      cacheControlMaxAge: 300,
    },
  )

  return NextResponse.json({
    id,
    manageSecret,
    expiresAt,
    filename,
    size: pdf.byteLength,
  })
}
