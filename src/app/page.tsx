import Link from 'next/link'

import { ProjectCreateForm } from '@/components/project/project-create-form'

const featureList = [
  '音声 1 本 + 台本画像複数枚のアップロード',
  'OCR / LLM 処理のための下準備',
  '段落ごとの 5 ステージ学習フロー',
  'ローカル SQLite とファイル保存',
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5f7ff,_#eef2ff_35%,_#fafafa_70%)] px-6 py-10 text-zinc-950">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="grid gap-6 self-start">
          <div className="inline-flex w-fit rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1 text-sm font-medium text-indigo-700">
            Local-first shadowing workflow
          </div>
          <div className="grid gap-4">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Shadowing Helper
            </h1>
            <p className="max-w-2xl text-base leading-8 text-zinc-600 sm:text-lg">
              音声と台本画像を読み込み、段落ごとに 5 段階のシャドーイング学習を進めるための
              ローカル Web アプリです。今の段階では、まずプロジェクト作成とファイル保存の土台を
              完成させます。
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur">
            <h2 className="text-lg font-semibold">この MVP の最初の到達点</h2>
            <ul className="grid gap-3 text-sm text-zinc-700 sm:text-base">
              {featureList.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/projects"
              className="rounded-2xl border border-zinc-300 bg-white px-4 py-3 font-medium text-zinc-900 transition hover:border-zinc-900"
            >
              プロジェクト一覧を見る
            </Link>
            <span className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
              OCR / LLM / 録音ステージは次の実装フェーズで追加
            </span>
          </div>
        </section>

        <section className="self-start">
          <ProjectCreateForm />
        </section>
      </div>
    </main>
  )
}
