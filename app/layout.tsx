import type { Metadata } from 'next'
import { DM_Sans, DM_Mono, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import BottomNav from '@/components/BottomNav'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})

// Barlow Condensed pré-carregada globalmente: usada em CondicaoCard (temperatura ao vivo),
// FDS cards e títulos de trilha — preload único evita FOUT no LCP
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-barlow-condensed',
  display: 'swap',
})

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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2a2e25" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MTB Forecaster" />
        <link rel="apple-touch-icon" href="/icons/icon-apple.png" />
        {/* Preconnect para Open-Meteo — usado em CondicaoCard (dados ao vivo) */}
        <link rel="preconnect" href="https://api.open-meteo.com" />
        <link rel="dns-prefetch" href="https://api.open-meteo.com" />
      </head>
      <body className={`${dmSans.variable} ${dmMono.variable} ${barlowCondensed.variable} min-h-screen antialiased`}>
        <Navbar />
        <main>
          {children}
        </main>
        <BottomNav />
        <Analytics />
        <SpeedInsights />
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
