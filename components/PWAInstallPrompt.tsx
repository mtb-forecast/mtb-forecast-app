'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    if (localStorage.getItem('pwa-dismissed') === 'true') return

    const ios = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())
    setIsIOS(ios)

    // Se vem do pós-cadastro, exibe o prompt
    const postCadastro = localStorage.getItem('show-pwa-prompt') === 'true'
    if (postCadastro) {
      localStorage.removeItem('show-pwa-prompt')
      setShowPrompt(true)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShowPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowPrompt(false)
      setIsInstalled(true)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('pwa-dismissed', 'true')
  }

  if (isInstalled || !showPrompt) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      zIndex: 1000,
      padding: '16px',
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#111',
        border: '1.5px solid #FFE000',
        borderRadius: '12px',
        padding: '20px',
        maxWidth: '480px',
        margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            width: '48px', height: '48px',
            background: '#111', border: '1px solid #333',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'Georgia,serif', fontSize: '12px', fontWeight: '700', color: '#FFE000', letterSpacing: '-0.5px' }}>MTB</span>
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '500', color: '#fff' }}>Instalar MTB Forecaster</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Acesse suas trilhas na tela inicial</div>
          </div>
        </div>

        {isIOS ? (
          <div style={{ fontSize: '13px', color: '#888', lineHeight: '1.6', marginBottom: '16px' }}>
            No Safari: toque em <span style={{ color: '#FFE000' }}>Compartilhar</span> → <span style={{ color: '#FFE000' }}>Adicionar à Tela de Início</span>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#888', lineHeight: '1.6', marginBottom: '16px' }}>
            Instale o app para acesso rápido às condições das suas trilhas — sem precisar abrir o navegador.
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          {!isIOS && (
            <button
              onClick={handleInstall}
              style={{
                flex: 1,
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: '4px',
                padding: '10px', fontSize: '14px', fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Instalar
            </button>
          )}
          <button
            onClick={handleDismiss}
            style={{
              flex: isIOS ? 1 : 'none',
              background: 'transparent', color: '#888',
              border: '1px solid #333', borderRadius: '4px',
              padding: '10px 16px', fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
