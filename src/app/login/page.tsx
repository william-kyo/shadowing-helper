export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

import { GoogleSignInButton } from '@/components/auth/google-sign-in-button'
import { LoginForm } from '@/components/auth/login-form'
import { getCurrentAppUser } from '@/lib/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const currentUser = await getCurrentAppUser()

  if (currentUser) {
    redirect('/')
  }

  const { error } = await searchParams
  const showOAuthError = error === 'oauth'

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-surface px-4 py-8 text-ink sm:px-6 sm:py-10 lg:overflow-hidden">
      {/* oversized vermillion brushstroke marker — pure decoration */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-12 top-1/4 hidden font-display text-[28rem] font-semibold leading-none tracking-tighter text-accent/[0.08] lg:block"
      >
        影
      </span>

      <div className="relative mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 lg:gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="grid gap-4 px-2 sm:gap-6 sm:px-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-chip border border-accent-soft bg-accent-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-deep">
            <span className="h-1.5 w-1.5 rounded-chip bg-accent" />
            内部アクセスのみ
          </div>
          <div className="grid gap-4 sm:gap-5">
            <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              シャドーイング
              <br />
              <span className="text-accent">ヘルパー.</span>
            </h1>
            <p className="max-w-xl text-sm leading-7 text-ink-muted sm:text-base sm:leading-8">
              社内で発行したメールアドレス、またはGoogleアカウントでログインすると、自分のプロジェクト一覧と学習ワークスペースに入れます。Googleで初めてログインすると、アカウントが自動的に作成されます。
            </p>
          </div>
        </section>

        <section className="self-center pb-4 lg:pb-0">
          <div className="grid gap-4">
            {showOAuthError ? (
              <p className="rounded-inset border border-accent-soft bg-accent-faint px-4 py-3 text-sm text-accent-deep">
                Googleログインに失敗しました。もう一度お試しください。
              </p>
            ) : null}

            <LoginForm />

            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-ink-line" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                または
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
