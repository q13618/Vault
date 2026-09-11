/**
 * 站点对外的规范域名。
 *
 * 分享链接要尽量短、而且只有一种写法 —— 同一个文件不该一会儿是
 * `f.airppp.com/d/xxx`、一会儿是 `vault-lake-alpha.vercel.app/d/xxx`。
 *
 * 取值顺序：
 * 1. `VAULT_CANONICAL_HOST` —— 手动指定，优先级最高。
 * 2. 生产部署时用 Vercel 注入的 `VERCEL_PROJECT_PRODUCTION_URL`：
 *    绑好自定义域名后它就是那个域名，所以换域名不需要改代码。
 *    这个变量在预览部署里也有值，因此必须限定 `VERCEL_ENV === 'production'`，
 *    否则预览环境会生成指向生产域名的链接。
 * 3. 都没有 —— 返回 null，前端退回用当前访问的地址，行为和以前一致。
 */
export function canonicalOrigin(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const explicit = env.VAULT_CANONICAL_HOST?.trim()
  if (explicit) return normalizeOrigin(explicit)

  if (env.VERCEL_ENV === 'production') {
    const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    if (production) return normalizeOrigin(production)
  }

  return null
}

/** 容忍 `f.airppp.com`、`https://f.airppp.com`、带末尾斜杠等各种写法。 */
export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withScheme).origin
  } catch {
    return null
  }
}
