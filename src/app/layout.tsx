import type { Metadata } from 'next'
import { Fraunces, Geist_Mono, Noto_Sans_JP } from 'next/font/google'

import { AuthFetchInterceptor } from '@/components/auth/auth-fetch-interceptor'
import { BottomNav } from '@/components/nav/bottom-nav'
import { WebVitals } from '@/components/perf/web-vitals'
import { I18nProvider } from '@/lib/i18n/client'
import { getLocale, getT } from '@/lib/i18n/server'

import './globals.css'

const notoJp = Noto_Sans_JP({
  variable: '--font-jp-sans',
  subsets: ['latin'],
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return {
    title: t.meta.appTitle,
    description: t.meta.appDescription,
    appleWebApp: {
      capable: true,
      title: t.meta.appShortTitle,
      statusBarStyle: 'default',
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()

  return (
    <html
      lang={locale}
      className={`${notoJp.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden bg-surface text-ink">
        <I18nProvider locale={locale}>
          <WebVitals />
          <AuthFetchInterceptor />
          {children}
          <BottomNav />
        </I18nProvider>
      </body>
    </html>
  )
}
