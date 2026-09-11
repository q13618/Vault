import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { hashManageSecret } from '@/lib/paths'
import { deleteById, findById } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function matches(expectedHash: string, actualHash: string): boolean {
  const a = Buffer.from(expectedHash)
  const b = Buffer.from(actualHash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * 上传者提前撤回文件。
 *
 * 凭据是上传时生成的撤回口令 —— 路径里只存了它的哈希，
 * 所以除了上传者本人，谁都没法删掉这个文件。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const manageSecret = new URL(request.url).searchParams.get('s')
  if (!manageSecret) {
    return NextResponse.json({ error: '缺少撤回口令' }, { status: 400 })
  }

  const file = await findById(id)
  if (!file) {
    return NextResponse.json({ error: '文件不存在' }, { status: 404 })
  }
  if (!matches(file.manageHash, await hashManageSecret(manageSecret))) {
    return NextResponse.json({ error: '撤回口令无效' }, { status: 403 })
  }

  const deleted = await deleteById(id)
  return NextResponse.json({ deleted }, { status: deleted ? 200 : 404 })
}
