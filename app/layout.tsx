import type { Metadata } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import BottomNav from '@/components/BottomNav'
import { Analytics } from '@vercel/analytics/next'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})

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
        <link
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2a2e25" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MTB Forecaster" />
        <link rel="apple-touch-icon" href="/icons/icon-apple.png" />
      </head>
      <body className={`${dmSans.variable} ${dmMono.variable} min-h-screen antialiased`}>
        <Navbar />
        <main>
          {children}
        </main>
        <BottomNav />
        <Analytics />
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
