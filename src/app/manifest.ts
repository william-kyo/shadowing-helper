import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Shadowing Helper',
    short_name: 'Shadowing',
    description: 'Stage-based audio shadowing practice',
    start_url: '/projects',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#4f46e5',
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
