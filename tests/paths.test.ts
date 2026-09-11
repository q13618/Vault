import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBlobPath,
  hashManageSecret,
  isValidId,
  MANAGE_HASH_LENGTH,
  newId,
  newManageSecret,
  newSecret,
  parseBlobPath,
  prefixForId,
  sanitizeFilename,
} from '../lib/paths.ts'

function samplePath(overrides: Partial<Parameters<typeof buildBlobPath>[0]> = {}) {
  return buildBlobPath({
    id: 'abcdefghjk',
    expiresAt: 1_800_000_000,
    secret: 'secretsecre2',
    manageHash: 'aaaabbbbccccdddd',
    filename: '假期视频.mp4',
    ...overrides,
  })
}

test('生成的 id 与随机段长度、字符集都符合约定', () => {
  for (let i = 0; i < 200; i += 1) {
    const id = newId()
    assert.equal(id.length, 10)
    assert.ok(isValidId(id), `unexpected id: ${id}`)
    assert.equal(newSecret().length, 12)
    assert.equal(newManageSecret().length, 16)
  }
})

test('路径编码后可以完整还原元信息（含中文文件名）', () => {
  const parsed = parseBlobPath(samplePath())
  assert.ok(parsed)
  assert.equal(parsed.id, 'abcdefghjk')
  assert.equal(parsed.expiresAt, 1_800_000_000)
  assert.equal(parsed.secret, 'secretsecre2')
  assert.equal(parsed.manageHash, 'aaaabbbbccccdddd')
  assert.equal(parsed.filename, '假期视频.mp4')
})

test('前缀查询用的正是 id 那一段', () => {
  assert.ok(samplePath().startsWith(prefixForId('abcdefghjk')))
})

test('畸形路径一律拒绝，不会被当成有效对象', () => {
  const bad = [
    '',
    'f/abcdefghjk',
    'f/abcdefghjk/1800000000/secretsecre2/hash/name/extra'.replace('/extra', ''), // manageHash 长度不对
    'f/SHORT/1800000000/secretsecre2/aaaabbbbccccdddd/a.txt', // id 非法
    'f/abcdefghjk/notanumber/secretsecre2/aaaabbbbccccdddd/a.txt',
    'f/abcdefghjk/1800000000/short/aaaabbbbccccdddd/a.txt',
    'other/abcdefghjk/1800000000/secretsecre2/aaaabbbbccccdddd/a.txt',
  ]
  for (const pathname of bad) {
    assert.equal(parseBlobPath(pathname), null, `should reject: ${pathname}`)
  }
})

test('文件名里的目录分隔符会被剥掉，不会写出额外层级', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd')
  assert.equal(sanitizeFilename('C:\\Users\\me\\a.txt'), 'a.txt')
  assert.equal(sanitizeFilename(''), 'file')

  const parsed = parseBlobPath(samplePath({ filename: 'a/b/c.bin' }))
  assert.equal(parsed?.filename, 'c.bin')
})

test('撤回口令只以哈希形式落在路径里', async () => {
  const manageSecret = newManageSecret()
  const hash = await hashManageSecret(manageSecret)
  assert.equal(hash.length, MANAGE_HASH_LENGTH)
  assert.ok(!hash.includes('/') && !hash.includes('+'))
  assert.equal(hash, await hashManageSecret(manageSecret))
  assert.notEqual(hash, await hashManageSecret(newManageSecret()))

  const stored = samplePath({ manageHash: hash })
  assert.ok(!stored.includes(manageSecret), '口令本身不应出现在对象路径中')
  assert.equal(parseBlobPath(stored)?.manageHash, hash)
})
