'use client'

import { useEffect, useState } from 'react'

import { formatRemaining } from '@/lib/format'

/** 倒计时。服务端先渲染一次静态值，挂载后每秒刷新。 */
export default function Countdown({ expiresAt }: { expiresAt: number }) {
  const deadline = expiresAt * 1000
  const [left, setLeft] = useState(() => deadline - Date.now())

  useEffect(() => {
    const tick = () => setLeft(deadline - Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [deadline])

  return <span suppressHydrationWarning>{formatRemaining(left)}后过期</span>
}
