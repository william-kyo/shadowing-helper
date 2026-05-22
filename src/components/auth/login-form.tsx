'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(error.message || 'ログインに失敗しました。')
      return
    }

    router.replace('/')
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-card border border-ink-line bg-paper p-6 shadow-[0_1px_0_rgba(29,27,24,0.03),0_22px_50px_-30px_rgba(29,27,24,0.45)]"
    >
      <div className="grid gap-2">
        <label
          htmlFor="email"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-inset border border-ink-line bg-paper px-4 py-3 text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/30"
          placeholder="name@company.com"
          required
        />
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="password"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-inset border border-ink-line bg-paper px-4 py-3 text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/30"
          placeholder="••••••••"
          required
        />
      </div>

      {errorMessage ? (
        <p className="rounded-inset border border-accent-soft bg-accent-faint px-4 py-3 text-sm text-accent-deep">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center rounded-chip bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'ログイン中…' : 'ログイン →'}
      </button>
    </form>
  )
}
