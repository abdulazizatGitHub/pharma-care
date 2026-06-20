import React from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm'

// This page is accessible to all authenticated roles.
// It handles its own auth — it is NOT wrapped in any role layout.
// proxy.ts excludes /change-password from the middleware guard so a user
// with force_password_change=true can always reach it after login.

export default async function ChangePasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ background: '#0a1628' }}
    >
      {/* Subtle radial gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(15,110,86,0.15) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: 10,
          border: '0.5px solid rgba(0,0,0,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          width: '100%',
          maxWidth: 380,
          padding: 28,
        }}
      >
        <div className="mb-6">
          <h1 className="text-[18px] font-medium text-[#111827]">Change Password</h1>
          <p className="mt-1 text-[13px] text-[#6b7280]">
            You must set a new password before continuing.
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  )
}
