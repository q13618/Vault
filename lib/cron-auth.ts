/**
 * 判断一个请求是不是真的来自 Vercel Cron。
 *
 * 两道关卡，按强度排列：
 *
 * 1. 设了 `CRON_SECRET` 时，Vercel 会给每次定时调用带上
 *    `Authorization: Bearer <CRON_SECRET>`，只认这个头 —— 这是官方推荐做法，生产环境请配上。
 * 2. 没设 `CRON_SECRET` 时，退而检查 `x-vercel-cron-schedule`：
 *    这个头由平台在定时调用时注入，且 `x-vercel-*` 请求头会被边缘网络
 *    覆盖，外部调用者伪造不了，所以零配置下清理任务也能正常跑起来。
 *
 * 注意不要用 `x-vercel-cron`（没有这个头）来判断，否则真正的定时调用会被 401 挡掉，
 * 过期文件就永远不会被清理。
 */
export function isAuthorizedCronRequest(
  request: Request,
  env: { CRON_SECRET?: string; NODE_ENV?: string } = process.env,
): boolean {
  if (env.CRON_SECRET) {
    return request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`
  }
  if (env.NODE_ENV !== 'production') return true
  return request.headers.get('x-vercel-cron-schedule') !== null
}
