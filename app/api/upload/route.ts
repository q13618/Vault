import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

import { parseBlobPath } from '@/lib/paths'
import { maxTtl, resolvePlan } from '@/lib/plans'
import { blobConfigured } from '@/lib/store'

export const runtime = 'nodejs'

/** 允许的时钟误差 / 上传耗时，避免边界值被误判。 */
const SKEW_SECONDS = 600

/**
 * 签发客户端直传令牌。
 *
 * 浏览器把文件直接传给 Blob 存储，不经过这个函数——所以大文件（视频、压缩包）
 * 不受 Serverless 请求体大小限制。这里只负责校验请求是否符合套餐额度。
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!blobConfigured()) {
    return NextResponse.json(
      { error: '存储未配置：请在 Vercel 项目里创建 Blob 存储并关联（BLOB_READ_WRITE_TOKEN）。' },
      { status: 503 },
    )
  }

  const body = (await request.json()) as HandleUploadBody
  const plan = resolvePlan(request)

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const parts = parseBlobPath(pathname)
        if (!parts) throw new Error('非法的上传路径')

        const nowSeconds = Math.floor(Date.now() / 1000)
        const ttl = parts.expiresAt - nowSeconds
        if (ttl < 60) throw new Error('保留时长过短')
        if (ttl > maxTtl(plan) + SKEW_SECONDS) {
          throw new Error(`当前套餐最长保留 ${Math.floor(maxTtl(plan) / 86400)} 天`)
        }

        return {
          // 内容类型不限：这是个通用中转站。
          allowedContentTypes: undefined,
          // 由 Blob 服务端强制执行，客户端改不了。
          maximumSizeInBytes: plan.maxFileBytes,
          // 路径已经自带随机段，不需要再加后缀；也不允许覆盖已有对象。
          addRandomSuffix: false,
          allowOverwrite: false,
          // 大文件分片上传可能持续一段时间，给令牌留足有效期。
          validUntil: Date.now() + 6 * 60 * 60 * 1000,
          // 缓存留短一点，过期删除后 CDN 不会继续吐旧内容。
          cacheControlMaxAge: 300,
          tokenPayload: JSON.stringify({ plan: plan.id }),
        }
      },
      onUploadCompleted: async () => {
        // 元信息全部编码在对象路径里，上传完成后无需额外落库。
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
