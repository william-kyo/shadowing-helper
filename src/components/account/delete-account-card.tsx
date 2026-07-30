'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { useT } from '@/lib/i18n/client'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

// Account deletion, gated behind typing the account's own email.
//
// The friction is deliberate: the content is genuinely destroyed, not archived,
// so a mis-tap must not be enough. Signing out afterwards matters too — the
// Supabase identity survives deletion, so a lingering session would keep bouncing
// the learner off every page with no explanation.
export function DeleteAccountCard({ email }: { email: string }) {
  const router = useRouter()
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = confirmation.trim().toLowerCase() === email.trim().toLowerCase()

  const handleDelete = async () => {
    if (!matches || isDeleting) return
    setError(null)
    setIsDeleting(true)

    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? t.account.deleteFailed)
        setIsDeleting(false)
        return
      }

      // Drop the local session before navigating, so the learner lands on the
      // login screen as a signed-out visitor rather than being turned away from
      // page after page.
      await createSupabaseBrowserClient().auth.signOut()
      router.replace('/login')
      router.refresh()
    } catch {
      setError(t.account.deleteFailed)
      setIsDeleting(false)
    }
  }

  return (
    <section
      aria-label={t.account.dangerZone}
      className="grid gap-3 rounded-card border border-accent-soft bg-paper p-5"
    >
      <div>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-deep">
          {t.account.dangerZone}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t.account.dangerBody}</p>
      </div>

      {!isOpen ? (
        <div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-chip border border-accent-soft bg-accent-faint px-4 py-2 text-sm font-medium text-accent-deep transition hover:border-accent hover:bg-accent-soft"
          >
            {t.account.deleteButton}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 rounded-inset border border-accent-soft bg-accent-faint p-4">
          <div>
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              {t.account.confirmTitle}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              {t.account.confirmBody}
            </p>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm text-ink-muted">{t.account.confirmPrompt}</span>
            <input
              type="email"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={t.account.confirmPlaceholder}
              className="rounded-inset border border-ink-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </label>

          {confirmation.length > 0 && !matches ? (
            <p className="text-xs text-accent-deep">{t.account.confirmMismatch}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-accent-deep">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!matches || isDeleting}
              className="rounded-chip bg-accent-deep px-4 py-2 text-sm font-semibold text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? t.account.deleting : t.account.confirmDelete}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setConfirmation('')
                setError(null)
              }}
              disabled={isDeleting}
              className="rounded-chip border border-ink-line bg-paper px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
            >
              {t.account.cancel}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
