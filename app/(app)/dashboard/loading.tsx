export default function DashboardLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>
      <div style={{ background: '#141612', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ height: 44, width: 260, background: 'rgba(244,243,239,.08)', borderRadius: 6, marginBottom: 10 }} />
          <div style={{ height: 16, width: 200, background: 'rgba(244,243,239,.05)', borderRadius: 4 }} />
          <div style={{ height: 1, background: 'rgba(109,116,95,.25)', marginTop: 22 }} />
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ height: 14, width: 160, background: 'rgba(109,116,95,.2)', borderRadius: 4, marginBottom: 14 }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(0,0,0,.07)',
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <div style={{ height: 4, background: '#e5e7eb' }} />
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 24, width: 120, background: '#F5F6F2', borderRadius: 4 }} />
                <div style={{ height: 20, width: '70%', background: '#F5F6F2', borderRadius: 4 }} />
                <div style={{ height: 12, width: '40%', background: '#F5F6F2', borderRadius: 4 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  <div style={{ background: '#F8F9F5', border: '1px solid rgba(0,0,0,.05)', borderRadius: 10, height: 56 }} />
                  <div style={{ background: '#F8F9F5', border: '1px solid rgba(0,0,0,.05)', borderRadius: 10, height: 56 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
