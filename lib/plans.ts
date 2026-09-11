/**
 * 套餐（保留时长 / 单文件大小）。
 *
 * 现阶段全站按 `anon` 匿名套餐运行：无需注册即可上传。
 * `member` / `plus` / `pro` 已在此定义好额度，等账号体系与支付接入后
 * 只需让 `resolvePlan()` 返回对应套餐即可生效，其余代码无需改动。
 */

export type PlanId = 'anon' | 'member' | 'plus' | 'pro'

export interface Plan {
  id: PlanId
  /** 展示名 */
  label: string
  /** 价格说明（展示用） */
  price: string
  /** 单个文件大小上限（字节） */
  maxFileBytes: number
  /** 可选保留时长（秒），第一项之外的顺序即界面顺序 */
  ttls: number[]
  /** 默认保留时长（秒） */
  defaultTtl: number
  /** 是否已开放 */
  available: boolean
}

const MB = 1024 * 1024
const GB = 1024 * MB

export const MINUTE = 60
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/** 允许用环境变量调整匿名套餐额度，便于在不改代码的情况下控制成本。 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const PLANS: Record<PlanId, Plan> = {
  anon: {
    id: 'anon',
    label: '免费使用',
    price: '无需注册',
    maxFileBytes: envInt('VAULT_ANON_MAX_MB', 200) * MB,
    ttls: [HOUR, 6 * HOUR, DAY, 3 * DAY, 7 * DAY],
    defaultTtl: DAY,
    available: true,
  },
  member: {
    id: 'member',
    label: '注册会员',
    price: '免费注册',
    maxFileBytes: 1 * GB,
    ttls: [HOUR, 6 * HOUR, DAY, 3 * DAY, 7 * DAY, 30 * DAY],
    defaultTtl: 7 * DAY,
    available: false,
  },
  plus: {
    id: 'plus',
    label: 'Plus',
    price: '按月订阅',
    maxFileBytes: 5 * GB,
    ttls: [DAY, 7 * DAY, 30 * DAY, 90 * DAY, 180 * DAY],
    defaultTtl: 30 * DAY,
    available: false,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    price: '按年订阅',
    maxFileBytes: 20 * GB,
    ttls: [7 * DAY, 30 * DAY, 180 * DAY, 365 * DAY],
    defaultTtl: 365 * DAY,
    available: false,
  },
}

export const PLAN_ORDER: PlanId[] = ['anon', 'member', 'plus', 'pro']

/**
 * 解析当前请求对应的套餐。
 *
 * 目前一律返回匿名套餐 —— 这是「不需要登记注册」的默认路径。
 * 接入登录后，在此读取会话并返回会员套餐即可。
 */
export function resolvePlan(_request?: Request): Plan {
  return PLANS.anon
}

/** 该套餐允许的最长保留时长（秒）。 */
export function maxTtl(plan: Plan): number {
  return Math.max(...plan.ttls)
}
