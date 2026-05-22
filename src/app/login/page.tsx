export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/auth/login-form'
import { getCurrentAppUser } from '@/lib/auth'

export default async function LoginPage() {
  const currentUser = await getCurrentAppUser()

  if (currentUser) {
    redirect('/')
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-surface px-6 py-10 text-ink">
      {/* oversized vermillion brushstroke marker — pure decoration */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-12 top-1/4 hidden font-display text-[28rem] font-semibold leading-none tracking-tighter text-accent/[0.08] lg:block"
      >
        影
      </span>

      <div className="relative mx-auto grid w-full max-w-5xl gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="grid gap-6 self-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-chip border border-accent-soft bg-accent-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-deep">
            <span className="h-1.5 w-1.5 rounded-chip bg-accent" />
            internal access only
          </div>
          <div className="grid gap-5">
            <h1 className="max-w-2xl font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Shadowing
              <br />
              <span className="text-accent">Helper.</span>
            </h1>
            <p className="max-w-xl text-base leading-8 text-ink-muted sm:text-lg">
              社内で発行したアカウントでログインすると、自分のプロジェクト一覧と学習ワークスペースに
              入れます。登録は公開せず、Supabase 管理画面から内部ユーザーだけを追加します。
            </p>
          </div>
        </section>

        <section className="self-center">
          <LoginForm />
        </section>
      </div>
    </main>
  )
}
