import { sanitizeFilename } from './paths.ts'

const MAX_STEM_LENGTH = 80

/**
 * 由网址推一个人能看懂的文件名。
 *
 *   https://www.zhihu.com/question/12345  ->  zhihu.com-question-12345.pdf
 *   https://example.com/                  ->  example.com.pdf
 *
 * 收件人在微信里看到的就是这个名字，所以宁可长一点也要保留可辨识的路径，
 * 而不是一串随机码。
 */
export function pageFilename(url: URL): string {
  const host = url.hostname.replace(/^www\./i, '')
  const segments = url.pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .filter(Boolean)

  let stem = [host, ...segments].join('-')
  // 去掉扩展名（/a/b.html 没必要留成 b.html-…），以及连字符的重复与首尾
  stem = stem
    .replace(/\.(html?|aspx?|php|jsp)$/i, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (stem.length > MAX_STEM_LENGTH) stem = stem.slice(0, MAX_STEM_LENGTH).replace(/-+$/, '')

  return sanitizeFilename(`${stem || 'page'}.pdf`)
}
