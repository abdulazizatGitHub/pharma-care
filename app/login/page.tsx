'use client'

import React, { useState, useActionState } from 'react'
import { Pill, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signIn } from '@/app/actions/auth'

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, null)
  const [showPassword, setShowPassword] = useState(false)

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
          animation: 'slideUp 0.3s ease-out',
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
        {/* Brand */}
        <div className="flex flex-col items-center mb-7">
          <div
            className="flex items-center justify-center mb-4"
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: '#0F6E56',
            }}
          >
            <Pill size={22} className="text-white" />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 500, color: '#111827' }}>PharmaCare</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Pharmacy Management System</p>
        </div>

        {state?.error && (
          <div
            role="alert"
            className="mb-5 px-4 py-3 rounded-lg text-[12px]"
            style={{
              background: '#FCEBEB',
              border: '0.5px solid #f09595',
              color: '#A32D2D',
            }}
          >
            {state.error}
          </div>
        )}

        <form action={action} className="flex flex-col gap-4">
          <Input
            label="Email"
            name="email"
            type="email"
            placeholder="admin@pharmacy.com"
            required
            autoFocus
            autoComplete="email"
            disabled={pending}
            style={{ height: 36 }}
          />

          <div className="relative">
            <Input
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              disabled={pending}
              style={{ height: 36 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 transition-colors"
              style={{ top: 28, color: '#9ca3af' }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full mt-1"
            loading={pending}
          >
            Sign In
          </Button>
        </form>
      </div>
    </div>
  )
}
