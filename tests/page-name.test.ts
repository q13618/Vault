import assert from 'node:assert/strict'
import test from 'node:test'

import { pageFilename } from '../lib/page-name.ts'

const name = (href: string) => pageFilename(new URL(href))

test('由网址推出可读的文件名', () => {
  assert.equal(name('https://example.com/'), 'example.com.pdf')
  assert.equal(name('https://www.zhihu.com/question/12345'), 'zhihu.com-question-12345.pdf')
  assert.equal(name('https://example.com/a/b/c'), 'example.com-a-b-c.pdf')
})

test('去掉 www 前缀和常见网页扩展名', () => {
  assert.equal(name('https://www.example.com/post.html'), 'example.com-post.pdf')
  assert.equal(name('https://example.com/index.php'), 'example.com-index.pdf')
})

test('中文路径解码后保留，不留下百分号转义', () => {
  const result = name('https://example.com/%E6%96%87%E7%AB%A0')
  assert.equal(result, 'example.com-文章.pdf')
  assert.ok(!result.includes('%'))
})

test('空格与下划线归一成连字符，且不出现连续连字符', () => {
  assert.equal(name('https://example.com/hello world'), 'example.com-hello-world.pdf')
  assert.equal(name('https://example.com/a//b'), 'example.com-a-b.pdf')
  assert.ok(!name('https://example.com/a_-_b').includes('--'))
})

test('过长的路径被截断，且不以连字符结尾', () => {
  const result = name(`https://example.com/${'segment/'.repeat(40)}`)
  assert.ok(result.length <= 84, `实际长度 ${result.length}`)
  assert.ok(result.endsWith('.pdf'))
  assert.ok(!result.endsWith('-.pdf'))
})

test('查询串不进文件名，始终是 .pdf 结尾', () => {
  const result = name('https://example.com/search?q=secret&token=abc')
  assert.equal(result, 'example.com-search.pdf')
  assert.ok(!result.includes('token'))
})
