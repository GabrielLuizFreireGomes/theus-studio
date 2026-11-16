import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Theus Studio',
    short_name: 'Theus Studio',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#090909',
    theme_color: '#090909',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/studio-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/studio-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/studio-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
