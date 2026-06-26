export default function MantenedorLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>
      <div style={{ background: '#2a2e25', padding: '32px 0 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px', boxSizing: 'border-box' }}>
          <div style={{ height: 13, width: 60, background: '#3a4035', borderRadius: 4, marginBottom: 20 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <div style={{ height: 32, width: 240, background: '#3a4035', borderRadius: 6, marginBottom: 12 }} />
              <div style={{ height: 13, width: 140, background: '#3a4035', borderRadius: 4, opacity: 0.5 }} />
            </div>
            <div style={{ width: 120, height: 72, background: '#3a4035', borderRadius: 10, flexShrink: 0 }} />
          </div>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />
      <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ height: 11, width: 55, background: '#e5e7eb', borderRadius: 4, marginBottom: 16 }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, height: 140, border: '0.5px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ height: 3, background: '#e5e7eb' }} />
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
