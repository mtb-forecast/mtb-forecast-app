export default function MantenedorLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* Hero skeleton */}
      <div style={{ background: '#141612', padding: '32px 28px 28px', borderBottom: '1px solid rgba(109,116,95,.25)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ height: 11, width: 60, background: 'rgba(244,243,239,.08)', borderRadius: 4, marginBottom: 20 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <div style={{ height: 48, width: 120, background: 'rgba(244,243,239,.08)', borderRadius: 8 }} />
            <div style={{ height: 30, width: 200, background: 'rgba(244,243,239,.08)', borderRadius: 6 }} />
          </div>
          <div style={{ height: 11, width: 120, background: 'rgba(244,243,239,.05)', borderRadius: 4 }} />
        </div>
      </div>

      {/* Cards skeleton */}
      <div style={{ padding: '24px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ height: 11, width: 55, background: 'rgba(0,0,0,.08)', borderRadius: 4, marginBottom: 14 }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid rgba(0,0,0,.07)', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
              <div style={{ height: 4, background: '#e5e7eb' }} />
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 14, width: '55%', background: '#F5F6F2', borderRadius: 4 }} />
                <div style={{ height: 18, width: '70%', background: '#F5F6F2', borderRadius: 4 }} />
                <div style={{ height: 11, width: '40%', background: '#F5F6F2', borderRadius: 4 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                  <div style={{ height: 52, background: '#F8F9F5', borderRadius: 8 }} />
                  <div style={{ height: 52, background: '#F8F9F5', borderRadius: 8 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
