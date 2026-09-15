/**
 * 网页 → PDF 的渲染器。
 *
 * 渲染这件事全部收在这个接口后面，目前的实现是 Cloudflare Browser Rendering。
 * 将来要换成自建 Chromium 或别家托管服务，只需要在这里加一个实现，
 * 调用方（app/api/pdf/route.ts）一行都不用改。
 */

export interface PageRenderer {
  /** 渲染成 PDF 字节。失败时抛 RenderError。 */
  renderPdf(url: string, options?: { signal?: AbortSignal }): Promise<Uint8Array>
}

export class RenderError extends Error {
  /** 给用户看的说明，已经过措辞处理，可以直接展示。 */
  readonly userMessage: string

  constructor(userMessage: string, detail?: string) {
    super(detail ? `${userMessage}（${detail}）` : userMessage)
    this.name = 'RenderError'
    this.userMessage = userMessage
  }
}

export function rendererConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN)
}

/** 留给页面导航的时间。整个接口的预算是 60 秒，这里收在 30 秒以内。 */
const NAVIGATION_TIMEOUT_MS = 30_000

class CloudflareRenderer implements PageRenderer {
  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
  ) {}

  async renderPdf(url: string, options: { signal?: AbortSignal } = {}): Promise<Uint8Array> {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/browser-rendering/pdf`

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          url,
          // 桌面视口，出来的排版更接近人眼看到的页面。
          viewport: { width: 1280, height: 1600 },
          gotoOptions: {
            // networkidle0 对懒加载的图片友好，代价是慢一些。
            waitUntil: 'networkidle0',
            timeout: NAVIGATION_TIMEOUT_MS,
          },
        }),
        signal: options.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RenderError('页面渲染超时了，可能内容太重或对方站点太慢')
      }
      throw new RenderError('连不上渲染服务，请稍后重试')
    }

    // 成功时直接返回 PDF 字节；失败时返回一段 JSON。
    const contentType = response.headers.get('content-type') ?? ''
    if (response.ok && contentType.includes('application/pdf')) {
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength === 0) throw new RenderError('渲染结果是空的，请换个地址试试')
      return new Uint8Array(buffer)
    }

    throw new RenderError(...(await describeFailure(response)))
  }
}

/** 把 Cloudflare 的报错翻译成用户看得懂的话，同时保留原始信息便于排查。 */
async function describeFailure(response: Response): Promise<[string, string?]> {
  let detail = ''
  try {
    const body = await response.text()
    try {
      const parsed = JSON.parse(body) as { errors?: { code?: number; message?: string }[] }
      detail = parsed.errors?.map((e) => e.message).filter(Boolean).join('; ') ?? body.slice(0, 200)
    } catch {
      detail = body.slice(0, 200)
    }
  } catch {
    // 读不出来就算了，状态码本身已经有信息量。
  }

  if (response.status === 401 || response.status === 403) {
    return ['渲染服务的凭据无效，请检查 Cloudflare API Token 的权限', detail]
  }
  if (response.status === 404) {
    return ['渲染服务地址不对，请检查 Cloudflare Account ID', detail]
  }
  if (response.status === 429) {
    return ['渲染服务额度用完了，过一会儿再试', detail]
  }
  return ['这个页面没能渲染出来 —— 可能有登录墙或人机验证，也可能对方拒绝了访问', detail]
}

export function getRenderer(): PageRenderer | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) return null
  return new CloudflareRenderer(accountId, apiToken)
}
