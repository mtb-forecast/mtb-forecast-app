'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconLayoutDashboard, IconMap2, IconPlayerRecord, IconMapPin, IconUser,
  type TablerIcon,
} from '@tabler/icons-react'

const NAV_ITEMS: { href: string; label: string; Icon: TablerIcon }[] = [
  { href: '/dashboard', label: 'Dashboard', Icon: IconLayoutDashboard },
  { href: '/trilhas',   label: 'Trilhas',   Icon: IconMap2            },
  { href: '/gravar',    label: 'Gravar',    Icon: IconPlayerRecord    },
  { href: '/mapa',      label: 'Mapa',      Icon: IconMapPin          },
  { href: '/perfil',    label: 'Perfil',    Icon: IconUser            },
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
          z-index: 2000;
          background: #2a2e25;
          border-top: 1px solid #3a4035;
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
          padding: 6px 10px;
          border-radius: 8px;
          transition: background 0.15s;
          position: relative;
        }
        .bnav-item:hover { background: #3a4035; }

        .bnav-icon {
          color: #8a9280;
          transition: color 0.15s;
          display: block;
        }

        .bnav-label {
          font-size: 9px;
          font-weight: 500;
          color: #8a9280;
          letter-spacing: 0.02em;
          transition: color 0.15s;
        }

        .bnav-item.active .bnav-icon { color: #f4f5f0; }
        .bnav-item.active .bnav-label { color: #a8b899; }

        .bnav-dot {
          width: 3px; height: 3px;
          background: #a8b899;
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
            <item.Icon size={22} className="bnav-icon" aria-hidden="true" />
            <span className="bnav-label">{item.label}</span>
            {isActive(item.href) && <span className="bnav-dot" />}
          </Link>
        ))}
      </nav>
    </>
  )
}
