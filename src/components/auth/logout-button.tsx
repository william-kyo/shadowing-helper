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
      className="rounded-chip border border-ink-line bg-paper px-4 py-2.5 text-xs font-medium tracking-wide text-ink-muted transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isSubmitting ? 'ログアウト中…' : 'ログアウト'}
    </button>
  )
}
