import React from 'react'
import Link from 'next/link'
import { ShieldX } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/lib/button-variants'
import { getDefaultRoute } from '@/lib/routes'

interface Props {
  searchParams: Promise<{ message?: string }>
}

export default async function UnauthorizedPage({ searchParams }: Props) {
  const { message } = await searchParams
  const displayMessage = message
    ? decodeURIComponent(message)
    : 'You do not have permission to access this page.'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let dashboardHref = '/login'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    dashboardHref = getDefaultRoute(profile?.role as string | undefined)
  }

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
          textAlign: 'center',
        }}
      >
        <div
          className="flex items-center justify-center mx-auto mb-4"
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: '#FCEBEB',
          }}
        >
          <ShieldX size={20} style={{ color: '#A32D2D' }} />
        </div>

        <h1 style={{ fontSize: 16, fontWeight: 500, color: '#111827', marginBottom: 8 }}>
          Access denied
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
          {displayMessage}
        </p>

        <Link href={dashboardHref} className={buttonVariants('primary', 'md')}>
          {user ? 'Go to My Dashboard' : 'Go to Login'}
        </Link>
      </div>
    </div>
  )
}
