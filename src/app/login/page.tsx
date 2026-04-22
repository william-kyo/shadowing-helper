export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/auth/login-form'
import { getCurrentAppUser } from '@/lib/auth'

export default async function LoginPage() {
  const currentUser = await getCurrentAppUser()

  if (currentUser) {
    redirect('/projects')
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5f7ff,_#eef2ff_35%,_#fafafa_70%)] px-6 py-10 text-zinc-950">
      <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="grid gap-6 self-start">
          <div className="inline-flex w-fit rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1 text-sm font-medium text-indigo-700">
            Internal access only
          </div>
          <div className="grid gap-4">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Shadowing Helper
            </h1>
            <p className="max-w-2xl text-base leading-8 text-zinc-600 sm:text-lg">
              社内で発行したアカウントでログインすると、自分のプロジェクト一覧と学習ワークスペースに
              入れます。登録は公開せず、Supabase 管理画面から内部ユーザーだけを追加します。
            </p>
          </div>
        </section>

        <section className="self-start">
          <LoginForm />
        </section>
      </div>
    </main>
  )
}
