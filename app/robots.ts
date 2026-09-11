import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 分享链接是私密的，不该被收录。
        disallow: ['/d/', '/api/'],
      },
    ],
  }
}
