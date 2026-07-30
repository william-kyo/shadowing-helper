import type { MetadataRoute } from 'next'

import { getLocale, getT } from '@/lib/i18n/server'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [locale, t] = await Promise.all([getLocale(), getT()])

  return {
    name: t.meta.appTitle,
    short_name: t.meta.appShortTitle,
    description: t.meta.manifestDescription,
    lang: locale,
    // Launch to the home screen — the installed PWA / home-screen icon opens this.
    start_url: '/',
    display: 'standalone',
    // Bamboo-calm brand surface (cool greige page background)
    background_color: '#eaece6',
    theme_color: '#eaece6',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
