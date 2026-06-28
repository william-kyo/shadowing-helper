import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'シャドーイングヘルパー',
    short_name: 'シャドーイング',
    description: 'ステージベースのシャドーイング練習',
    // Launch to ホーム (home) — the installed PWA / home-screen icon opens this.
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
