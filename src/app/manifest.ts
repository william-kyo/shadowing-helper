import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
name: 'シャドーイングヘルパー',
  short_name: 'シャドーイング',
  description: 'ステージベースのシャドーイング練習',
    start_url: '/projects',
    display: 'standalone',
    // Warm-paper brand surface (was stale indigo/grey from the pre-redesign theme)
    background_color: '#f4ecdc',
    theme_color: '#f4ecdc',
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
