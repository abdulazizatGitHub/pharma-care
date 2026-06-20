'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  timeoutMinutes: number
}

const WARN_BEFORE_MS = 2 * 60 * 1000
const ACTIVITY_DEBOUNCE_MS = 30 * 1000
const CHECK_INTERVAL_MS = 10 * 1000

export function SessionTimeout({ timeoutMinutes }: Props) {
  const router = useRouter()
  const [showWarning, setShowWarning] = useState(false)
  const lastActivityRef = useRef(Date.now())
  const lastDebounceRef = useRef(Date.now())

  const logout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }, [router])

  const stayLoggedIn = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    lastDebounceRef.current = now
    setShowWarning(false)
  }, [])

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return

    const timeoutMs = timeoutMinutes * 60 * 1000

    function handleActivity() {
      const now = Date.now()
      if (now - lastDebounceRef.current >= ACTIVITY_DEBOUNCE_MS) {
        lastActivityRef.current = now
        lastDebounceRef.current = now
      }
    }

    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    EVENTS.forEach(e => document.addEventListener(e, handleActivity, { passive: true }))

    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      if (idle >= timeoutMs) {
        logout()
      } else if (idle >= timeoutMs - WARN_BEFORE_MS) {
        setShowWarning(true)
      } else {
        setShowWarning(false)
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      EVENTS.forEach(e => document.removeEventListener(e, handleActivity))
      clearInterval(interval)
    }
  }, [timeoutMinutes, logout])

  if (!timeoutMinutes || timeoutMinutes <= 0 || !showWarning) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 10,
          border: '0.5px solid rgba(0,0,0,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
          padding: '24px 28px',
          maxWidth: 360, width: '100%', margin: '0 16px',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 8px' }}>
          Session expiring soon
        </h3>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 }}>
          You will be automatically logged out in 2 minutes due to inactivity.
          Move your mouse or press any key to stay logged in.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={logout}
            style={{
              padding: '7px 14px', fontSize: 13, fontWeight: 500,
              border: '1px solid #e5e7eb', borderRadius: 6,
              background: '#fff', cursor: 'pointer', color: '#374151',
            }}
          >
            Logout now
          </button>
          <button
            onClick={stayLoggedIn}
            style={{
              padding: '7px 14px', fontSize: 13, fontWeight: 500,
              border: 'none', borderRadius: 6,
              background: '#0F6E56', cursor: 'pointer', color: '#fff',
            }}
          >
            Stay logged in
          </button>
        </div>
      </div>
    </div>
  )
}
