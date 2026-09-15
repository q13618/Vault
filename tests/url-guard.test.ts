import assert from 'node:assert/strict'
import test from 'node:test'

import { checkPageUrl } from '../lib/url-guard.ts'

function accepts(input: string, expectedHref?: string) {
  const result = checkPageUrl(input)
  assert.equal(result.ok, true, `应当接受：${input}`)
  if (result.ok && expectedHref) assert.equal(result.url.toString(), expectedHref)
}

function rejects(input: string) {
  const result = checkPageUrl(input)
  assert.equal(result.ok, false, `应当拒绝：${input}`)
  if (!result.ok) assert.ok(result.reason.length > 0, '拒绝时必须给出理由')
}

test('正常网址照单全收', () => {
  accepts('https://example.com/', 'https://example.com/')
  accepts('http://example.com/a/b?c=1')
  accepts('https://www.zhihu.com/question/12345')
  accepts('https://例子.中国/文章')
})

test('没写协议时按 https 补全', () => {
  accepts('example.com', 'https://example.com/')
  accepts('example.com/article', 'https://example.com/article')
})

test('只允许 http 与 https', () => {
  for (const input of [
    'file:///etc/passwd',
    'ftp://example.com/x',
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
  ]) {
    rejects(input)
  }
})

test('拒绝内网、回环与云元数据地址', () => {
  for (const host of [
    'http://localhost/',
    'http://localhost:8080/x',
    'http://foo.localhost/',
    'http://127.0.0.1/',
    'http://127.1.2.3/',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/', // 云厂商元数据端点
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[fe80::1]/',
    'http://[fd00::1]/',
  ]) {
    rejects(host)
  }
})

test('公网 IP 仍然允许 —— 只挡内网，不是挡所有 IP', () => {
  accepts('http://8.8.8.8/')
  accepts('http://172.32.0.1/') // 刚好在 172.16/12 之外
  accepts('http://192.167.1.1/')
})

test('拒绝畸形与可疑输入', () => {
  rejects('')
  rejects('   ')
  rejects('http://user:pass@example.com/') // 地址里带凭据
  rejects('http://intranet/') // 无点号的主机名，多半是内网
  rejects('http://999.1.1.1/') // 非法 IPv4
  rejects(`https://example.com/${'a'.repeat(3000)}`) // 超长
})
