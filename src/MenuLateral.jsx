export default function MenuLateral({ open, onClose, userData, turnoExiste, onCerrarTurno, onProduccion, onHistorial, onConfig, onInforme, onReportes, onSalir }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: '240px', background: '#fff', zIndex: 41, boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif' }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #F0F0ED' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#bbb', textTransform: 'uppercase', letterSpacing: '.08em' }}>Menú</div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {turnoExiste && (
            <button onClick={() => { onProduccion(); onClose() }} style={btnStyle('#111')}>
              📦 Producción
            </button>
          )}
          <button onClick={() => { onHistorial(); onClose() }} style={btnStyle('#111')}>
            📋 Historial
          </button>
          {userData?.rol === 'owner' && (
            <button onClick={() => { onConfig(); onClose() }} style={btnStyle('#111')}>
              ⚙️ Configuración
            </button>
          )}
          {userData?.rol === 'owner' && (
            <button onClick={() => { onReportes(); onClose() }} style={btnStyle('#111')}>
              🗒️ Reportes
            </button>
          )}
          <div style={{ marginTop: 'auto', borderTop: '1px solid #F0F0ED', paddingTop: '10px' }} />
          {turnoExiste && (
            <button onClick={() => { onCerrarTurno(); onClose() }} style={btnStyle('#E24B4A', '#fef9f9', '#fde8e8')}>
              ⏹ Cerrar turno
            </button>
          )}
          <button onClick={onSalir} style={btnStyle('#999')}>
            Salir
          </button>
        </div>
      </div>
    </>
  )
}

function btnStyle(color, bg = '#fafafa', border = '#e8e8e8') {
  return {
    width: '100%', textAlign: 'left', padding: '10px 14px',
    fontSize: '13px', fontWeight: '600', color,
    background: bg, border: `1px solid ${border}`,
    borderRadius: '10px', cursor: 'pointer'
  }
}
