import type { Metadata } from 'next'
import { Fraunces, Geist_Mono, Noto_Sans_JP } from 'next/font/google'

import { AuthFetchInterceptor } from '@/components/auth/auth-fetch-interceptor'
import { WebVitals } from '@/components/perf/web-vitals'

import './globals.css'

const notoJp = Noto_Sans_JP({
  variable: '--font-jp-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Shadowing Helper',
  description: 'Local-first shadowing practice app for audio, scripts, and stage-based study.',
  appleWebApp: {
    capable: true,
    title: 'Shadowing',
    statusBarStyle: 'default',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ja"
      className={`${notoJp.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden bg-surface text-ink">
        <WebVitals />
        <AuthFetchInterceptor />
        {children}
      </body>
    </html>
  )
}
