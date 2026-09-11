'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** 只有持有撤回口令的上传者才会看到这块。 */
export default function ManageActions({
  id,
  manageSecret,
}: {
  id: string
  manageSecret: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function revoke() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/f/${id}/delete?s=${encodeURIComponent(manageSecret)}`, {
        method: 'POST',
      })
      if (response.ok) {
        router.refresh()
      } else {
        setError('撤回失败，可能已经被清除了')
      }
    } catch {
      setError('网络异常，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '0 0 10px' }}>
        你是这个文件的上传者
      </p>
      <button type="button" className="btn btn-danger" onClick={revoke} disabled={busy}>
        {busy ? '正在撤回…' : '立即撤回并删除'}
      </button>
      {error && <p className="item-error">{error}</p>}
    </div>
  )
}
