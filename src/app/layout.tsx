import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { WebVitals } from '@/components/perf/web-vitals'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Shadowing Helper',
  description: 'Local-first shadowing practice app for audio, scripts, and stage-based study.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-50 text-zinc-950">
        <WebVitals />
        {children}
      </body>
    </html>
  )
}
