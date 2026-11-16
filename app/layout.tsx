import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/instrument-sans';
import { Pwa } from '@/components/pwa';
import './studio.css';

export const metadata: Metadata = {
  title: { default: 'Theus Studio · Barbearia', template: '%s · Theus Studio' },
  description: 'Escolha seu serviço e agende um horário na Theus Studio.',
  robots: { index: false, follow: false },
  icons: { icon: '/icons/studio-192.png', apple: '/icons/studio-touch.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black' },
};

export const viewport: Viewport = { themeColor: '#090909', colorScheme: 'dark', viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><Pwa>{children}</Pwa></body></html>;
}
