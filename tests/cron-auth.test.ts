import assert from 'node:assert/strict'
import test from 'node:test'

import { isAuthorizedCronRequest } from '../lib/cron-auth.ts'

const PROD = { NODE_ENV: 'production' }

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/cron/reap', { headers })
}

test('设了 CRON_SECRET 时只认匹配的 Bearer 头', () => {
  const env = { ...PROD, CRON_SECRET: 's3cret' }
  assert.equal(isAuthorizedCronRequest(req({ authorization: 'Bearer s3cret' }), env), true)
  assert.equal(isAuthorizedCronRequest(req({ authorization: 'Bearer wrong' }), env), false)
  assert.equal(isAuthorizedCronRequest(req(), env), false)
  // 有密钥时，平台的调度头不能绕过密钥校验。
  assert.equal(isAuthorizedCronRequest(req({ 'x-vercel-cron-schedule': '17 * * * *' }), env), false)
})

test('没设 CRON_SECRET 时，认平台注入的调度头', () => {
  // 这条是回归测试：之前误用了并不存在的 x-vercel-cron 头，
  // 结果真正的定时调用被 401 挡掉，过期文件永远不会被清理。
  assert.equal(
    isAuthorizedCronRequest(req({ 'x-vercel-cron-schedule': '17 * * * *' }), PROD),
    true,
    '真实的 Vercel Cron 调用必须能通过',
  )
  assert.equal(isAuthorizedCronRequest(req(), PROD), false, '外部裸调用应当被拒')
  assert.equal(
    isAuthorizedCronRequest(req({ 'x-vercel-cron': '1' }), PROD),
    false,
    'x-vercel-cron 不是真实存在的头，不能作为凭据',
  )
})

test('本地开发时放行，便于手动触发清理', () => {
  assert.equal(isAuthorizedCronRequest(req(), { NODE_ENV: 'development' }), true)
  // 但本地一旦配了密钥，仍然按密钥校验。
  assert.equal(
    isAuthorizedCronRequest(req(), { NODE_ENV: 'development', CRON_SECRET: 's3cret' }),
    false,
  )
})
