export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

import { GoogleSignInButton } from '@/components/auth/google-sign-in-button'
import { LoginForm } from '@/components/auth/login-form'
import { LanguagePicker } from '@/components/i18n/language-picker'
import { ACCOUNT_DELETED_ERROR, PROJECT_HOME_URL } from '@/lib/account'
import { getAccountState } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const accountState = await getAccountState()

  if (accountState.user) {
    redirect('/')
  }

  const t = await getT()
  const { error } = await searchParams
  const showOAuthError = error === 'oauth'
  // Either the redirect said so, or the visitor still holds a session for an
  // account that no longer exists — both need the same explanation.
  const showDeletedNotice =
    error === ACCOUNT_DELETED_ERROR || accountState.status === 'deleted'

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-surface px-4 py-8 text-ink sm:px-6 sm:py-10 lg:overflow-hidden">
      {/* oversized vermillion brushstroke marker — pure decoration */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-12 top-1/4 hidden font-display text-[28rem] font-semibold leading-none tracking-tighter text-accent/[0.08] lg:block"
      >
        {t.auth.brandMark}
      </span>

      {/* Reachable before sign-in on purpose: someone who cannot read the
          default language needs to switch the app before they can log in. */}
      <div className="relative mx-auto flex w-full max-w-5xl justify-end px-2 sm:px-4">
        <LanguagePicker />
      </div>

      <div className="relative mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 lg:gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="grid gap-4 px-2 sm:gap-6 sm:px-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-chip border border-accent-soft bg-accent-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-deep">
            <span className="h-1.5 w-1.5 rounded-chip bg-accent" />
            {t.auth.internalOnly}
          </div>
          <div className="grid gap-4 sm:gap-5">
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {t.auth.brandLine1}
              <br />
              <span className="text-accent">{t.auth.brandLine2}</span>
            </h1>
            <p className="max-w-xl text-sm leading-7 text-ink-muted sm:text-base sm:leading-8">
              {t.auth.intro}
            </p>
          </div>
        </section>

        <section className="self-center pb-4 lg:pb-0">
          <div className="grid gap-4">
            {showDeletedNotice ? (
              <div className="grid gap-3 rounded-inset border border-accent-soft bg-accent-faint px-4 py-4">
                <div>
                  <p className="font-display text-base font-semibold tracking-tight text-accent-deep">
                    {t.account.deletedNotice}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    {t.account.deletedBody}
                  </p>
                </div>
                <a
                  href={PROJECT_HOME_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit rounded-chip bg-accent px-4 py-2 text-sm font-semibold text-paper transition hover:bg-accent-deep"
                >
                  {t.account.contactAuthor}
                </a>
              </div>
            ) : null}

            {showOAuthError ? (
              <p className="rounded-inset border border-accent-soft bg-accent-faint px-4 py-3 text-sm text-accent-deep">
                {t.auth.googleCallbackFailed}
              </p>
            ) : null}

            <LoginForm />

            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-ink-line" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                {t.auth.or}
              </span>
              <span className="h-px flex-1 bg-ink-line" />
            </div>

            <GoogleSignInButton />
          </div>
        </section>
      </div>
    </main>
  )
}
