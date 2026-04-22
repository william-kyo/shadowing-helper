'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function LogoutButton() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogout() {
    setIsSubmitting(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    setIsSubmitting(false)
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isSubmitting}
      className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium transition hover:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSubmitting ? 'ログアウト中…' : 'ログアウト'}
    </button>
  )
}
