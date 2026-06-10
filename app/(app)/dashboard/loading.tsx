export default function DashboardLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>
      <div style={{ background: '#2a2e25', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ height: 44, width: 260, background: '#3a4035', borderRadius: 6, marginBottom: 12 }} />
          <div style={{ height: 16, width: 300, background: '#3a4035', borderRadius: 4, opacity: 0.5 }} />
          <div style={{ background: '#a8b899', height: 3, marginTop: 20 }} />
        </div>
      </div>

      <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ height: 18, width: 180, background: '#e5e7eb', borderRadius: 4, marginBottom: 16 }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                borderRadius: 12,
                height: 140,
                border: '0.5px solid #E5E7EB',
                overflow: 'hidden',
              }}
            >
              <div style={{ height: 4, background: '#e5e7eb' }} />
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 16, width: '60%', background: '#f3f4f6', borderRadius: 4 }} />
                <div style={{ height: 12, width: '40%', background: '#f3f4f6', borderRadius: 4 }} />
                <div style={{ height: 28, width: '50%', background: '#f3f4f6', borderRadius: 6, marginTop: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
