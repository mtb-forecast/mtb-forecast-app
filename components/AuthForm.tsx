'use client'

import { useState } from 'react'
import Link from 'next/link'

type Field = {
  name: string
  label: string
  type: string
  placeholder?: string
  required?: boolean
}

type Props = {
  title: string
  fields: Field[]
  submitLabel: string
  loadingLabel: string
  footerText: string
  footerLink: string
  footerLinkLabel: string
  onSubmit: (values: Record<string, string>) => Promise<void>
  error?: string | null
}

export default function AuthForm({
  title,
  fields,
  submitLabel,
  loadingLabel,
  footerText,
  footerLink,
  footerLinkLabel,
  onSubmit,
  error,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSubmit(values)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f4f5f0' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="text-3xl">🚵</span>
            <span className="text-2xl font-extrabold" style={{ color: '#2a2e25' }}>MTB Forecaster</span>
          </div>
        </div>

        <div className="rounded-2xl p-8 shadow-sm" style={{ background: '#fff', border: '1px solid #d0d4c6' }}>
          <h1 className="text-xl font-bold mb-6" style={{ color: '#2a2e25' }}>{title}</h1>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 mb-6 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium mb-2" style={{ color: '#6d745f' }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  required={field.required !== false}
                  placeholder={field.placeholder}
                  value={values[field.name] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                  className="input-field"
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
              style={{ background: loading ? '#a8b899' : '#6d745f' }}
            >
              {loading ? loadingLabel : submitLabel}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: '#6d745f' }}>
            {footerText}{' '}
            <Link href={footerLink} className="font-medium" style={{ color: '#6d745f', textDecoration: 'underline' }}>
              {footerLinkLabel}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
