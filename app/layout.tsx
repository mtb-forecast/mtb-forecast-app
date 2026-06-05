import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import BottomNav from '@/components/BottomNav'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'MTB Forecaster',
  description: 'Condições de trilhas e pump tracks em tempo real. Previsão do tempo, modelo de solo e veredicto para pedalar com segurança.',
  keywords: ['mountain bike', 'trilhas', 'pump track', 'previsão', 'condições', 'MTB', 'solo', 'chuva', 'enduro', 'DH'],
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/icons/icon-apple.png',
    shortcut: '/icons/icon-192.png',
  },
  openGraph: {
    title: 'MTB Forecaster',
    description: 'Trilhas e pump tracks monitorados em tempo real no Brasil.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#111111" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MTB Forecaster" />
        <link rel="apple-touch-icon" href="/icons/icon-apple.png" />
      </head>
      <body className="min-h-screen antialiased">
        <Navbar />
        <main>
          {children}
        </main>
        <BottomNav />
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
              })
            }
          `
        }} />
      </body>
    </html>
  )
}
