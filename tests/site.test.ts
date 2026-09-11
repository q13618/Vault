import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalOrigin, normalizeOrigin } from '../lib/site.ts'

test('域名写法归一化', () => {
  assert.equal(normalizeOrigin('f.airppp.com'), 'https://f.airppp.com')
  assert.equal(normalizeOrigin('https://f.airppp.com'), 'https://f.airppp.com')
  assert.equal(normalizeOrigin('https://f.airppp.com/'), 'https://f.airppp.com')
  assert.equal(normalizeOrigin('  f.airppp.com//  '), 'https://f.airppp.com')
  assert.equal(normalizeOrigin('http://localhost:3000'), 'http://localhost:3000')
  assert.equal(normalizeOrigin(''), null)
  assert.equal(normalizeOrigin('   '), null)
})

test('手动指定的 VAULT_CANONICAL_HOST 优先级最高', () => {
  assert.equal(
    canonicalOrigin({
      VAULT_CANONICAL_HOST: 'f.airppp.com',
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'vault-lake-alpha.vercel.app',
    }),
    'https://f.airppp.com',
  )
})

test('生产部署自动采用 Vercel 的生产域名', () => {
  assert.equal(
    canonicalOrigin({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'f.airppp.com' }),
    'https://f.airppp.com',
  )
})

test('预览部署不会生成指向生产域名的链接', () => {
  // VERCEL_PROJECT_PRODUCTION_URL 在预览部署里同样有值，
  // 所以必须靠 VERCEL_ENV 兜住，否则预览环境发出去的链接会指向生产站。
  assert.equal(
    canonicalOrigin({ VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'f.airppp.com' }),
    null,
  )
})

test('什么都没配时返回 null —— 前端退回用当前访问地址', () => {
  assert.equal(canonicalOrigin({}), null)
  assert.equal(canonicalOrigin({ VERCEL_ENV: 'production' }), null)
  assert.equal(canonicalOrigin({ VAULT_CANONICAL_HOST: '  ' }), null)
})
