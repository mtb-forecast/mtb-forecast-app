'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' },
  { href: '/trilhas',   label: 'Trilhas',   icon: 'ti-map-2'            },
  { href: '/mapa',      label: 'Mapa',      icon: 'ti-map-pin'          },
  { href: '/perfil',    label: 'Perfil',    icon: 'ti-user'             },
]

const HIDDEN_ON = ['/', '/login', '/cadastro']

export default function BottomNav() {
  const pathname = usePathname()

  if (!pathname) return null
  if (HIDDEN_ON.some(p => pathname === p || pathname.startsWith(p + '/'))) return null
  if (pathname.startsWith('/t/')) return null

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <style>{`
        .bnav-root {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 50;
          background: #111;
          border-top: 1px solid #2A2A2A;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-around;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }

        .bnav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          text-decoration: none;
          padding: 6px 16px;
          border-radius: 8px;
          transition: background 0.15s;
          position: relative;
        }
        .bnav-item:hover { background: #1A1A1A; }

        .bnav-icon {
          font-size: 22px;
          color: #555;
          transition: color 0.15s;
          line-height: 1;
        }

        .bnav-label {
          font-size: 9px;
          font-weight: 500;
          color: #555;
          letter-spacing: 0.02em;
          transition: color 0.15s;
        }

        .bnav-item.active .bnav-icon { color: #fff; }
        .bnav-item.active .bnav-label { color: #FFE000; }

        .bnav-dot {
          width: 3px; height: 3px;
          background: #FFE000;
          border-radius: 50%;
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
        }

        body { padding-bottom: 68px; }
      `}</style>

      <nav className="bnav-root" aria-label="Navegação principal">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`bnav-item${isActive(item.href) ? ' active' : ''}`}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            <i className={`ti ${item.icon} bnav-icon`} aria-hidden="true" />
            <span className="bnav-label">{item.label}</span>
            {isActive(item.href) && <span className="bnav-dot" />}
          </Link>
        ))}
      </nav>
    </>
  )
}
