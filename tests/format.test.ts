import assert from 'node:assert/strict'
import test from 'node:test'

import { formatBytes, formatRemaining, formatTtl } from '../lib/format.ts'
import { DAY, HOUR, maxTtl, PLANS } from '../lib/plans.ts'

test('体积展示', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(999), '999 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(200 * 1024 * 1024), '200 MB')
  assert.equal(formatBytes(5 * 1024 ** 3), '5.0 GB')
})

test('保留时长展示', () => {
  assert.equal(formatTtl(HOUR), '1 小时')
  assert.equal(formatTtl(6 * HOUR), '6 小时')
  assert.equal(formatTtl(DAY), '1 天')
  assert.equal(formatTtl(7 * DAY), '7 天')
})

test('倒计时展示', () => {
  assert.equal(formatRemaining(0), '已过期')
  assert.equal(formatRemaining(-1000), '已过期')
  assert.equal(formatRemaining(45 * 1000), '45 秒')
  assert.equal(formatRemaining(90 * 1000), '1 分 30 秒')
  assert.equal(formatRemaining(2 * HOUR * 1000), '2 小时')
  assert.equal(formatRemaining((2 * DAY + 3 * HOUR) * 1000), '2 天 3 小时')
})

test('匿名套餐默认可用，且默认时长在可选项里', () => {
  const anon = PLANS.anon
  assert.equal(anon.available, true)
  assert.ok(anon.ttls.includes(anon.defaultTtl))
  assert.equal(maxTtl(anon), 7 * DAY)
  // 付费档位的额度必须严格递增，否则界面上的对比就没意义了。
  assert.ok(PLANS.member.maxFileBytes > anon.maxFileBytes)
  assert.ok(PLANS.plus.maxFileBytes > PLANS.member.maxFileBytes)
  assert.ok(PLANS.pro.maxFileBytes > PLANS.plus.maxFileBytes)
  assert.ok(maxTtl(PLANS.pro) > maxTtl(PLANS.plus))
})
