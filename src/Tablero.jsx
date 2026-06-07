import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from './firebase'
import Drawer from './Drawer'

export default function Tablero({ user, userData }) {
  const [incidencias, setIncidencias] = useState([])
  const [config, setConfig] = useState(null)
  const [turnoId, setTurnoId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [franjaDrawer, setFranjaDrawer] = useState('')

  useEffect(() => {
    const hoy = new Date()
    const id = hoy.toISOString().slice(0, 10).replace(/-/g, '') + '_manana'
    setTurnoId(id)
  }, [])

  useEffect(() => {
    getDoc(doc(db, 'config', 'turno')).then(snap => {
      if (snap.exists()) setConfig(snap.data())
    })
  }, [])

  useEffect(() => {
    if (!turnoId) return
    const q = query(
      collection(db, 'turnos', turnoId, 'incidencias'),
      orderBy('horaInicio', 'asc')
    )
    const unsub = onSnapshot(q, snap => {
      setIncidencias(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [turnoId])

  const franjas = config ? generarFranjas(config) : []

  function abrirDrawer(franja) {
    setFranjaDrawer(franja)
    setDrawerOpen(true)
  }

  const incPorFranja = (franja) =>
    incidencias.filter(i => i.franja === franja && !i.eliminado)

  const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: '13px', background: '#f5f4ef', minHeight: '100vh' }}>

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e5e5e5', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: '500' }}>Panel de Control</span>
        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: '#e8f5ee', color: '#1D9E75' }}>Turno activo</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#888' }}>Obj: {config ? (config.objetivoGrande * franjas.length + config.objetivoChica * franjas.length) : '...'} ctos</span>
        <button onClick={() => signOut(auth)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: '0.5px solid #ddd', background: 'none', cursor: 'pointer', color: '#888' }}>
          Salir
        </button>
      </div>

      <div style={{ padding: '10px', display: 'grid', gridTemplateColumns: '1fr 160px', gap: '8px' }}>
        <div>
          {franjas.map(franja => {
            const incs = incPorFranja(franja)
            const criticas = incs.filter(i => i.grado === 'critico').length
            const moderadas = incs.filter(i => i.grado === 'moderado').length
            return (
              <Franja
                key={franja}
                franja={franja}
                incs={incs}
                criticas={criticas}
                moderadas={moderadas}
                gradoColor={gradoColor}
                onAgregar={() => abrirDrawer(franja)}
                userData={userData}
              />
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: '500', color: '#999', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '2px' }}>Por sector</div>
          <SemaforoSectores incidencias={incidencias} />
        </div>
      </div>

      {drawerOpen && (
        <Drawer
          franja={franjaDrawer}
          turnoId={turnoId}
          user={user}
          userData={userData}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  )
}

function generarFranjas(config) {
  const franjas = []
  const [hIni] = config.inicio.split(':').map(Number)
  const [hFin] = config.fin.split(':').map(Number)
  for (let h = hIni; h < hFin; h++) {
    const ini = `${String(h).padStart(2,'0')}:00`
    const fin = `${String(h+1).padStart(2,'0')}:00`
    franjas.push(`${ini}-${fin}`)
  }
  return franjas
}

function Franja({ franja, incs, criticas, moderadas, gradoColor, onAgregar, userData }) {
  const [open, setOpen] = useState(false)
  const label = franja.replace('-', ' — ')

  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', marginBottom: '6px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', cursor: 'pointer' }}>
        <span style={{ fontSize: '11px', fontWeight: '500' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {criticas > 0 && <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '8px', background: '#fef2f2', color: '#E24B4A', fontWeight: '500' }}>{criticas} crítica{criticas > 1 ? 's' : ''}</span>}
          {moderadas > 0 && <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '8px', background: '#fff8ee', color: '#BA7517', fontWeight: '500' }}>{moderadas} mod.</span>}
          {incs.length === 0 && <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '8px', background: '#f5f5f5', color: '#999' }}>sin incidencias</span>}
          <span style={{ fontSize: '11px', color: '#ccc' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: '0.5px solid #f0f0f0' }}>
          {incs.map(inc => (
            <IncidenciaRow key={inc.id} inc={inc} gradoColor={gradoColor} />
          ))}
          <div onClick={onAgregar} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', fontSize: '11px', color: '#185FA5', borderTop: '0.5px dashed #dce8f5', background: '#f0f6ff', cursor: 'pointer' }}>
            + Cargar incidencia
          </div>
        </div>
      )}
    </div>
  )
}

function IncidenciaRow({ inc, gradoColor }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '0.5px solid #f5f5f5' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px', cursor: 'pointer' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: gradoColor[inc.grado] || '#ccc', flexShrink: 0 }}></div>
        <span style={{ fontSize: '10px', color: '#999', minWidth: '34px' }}>{inc.horaInicio}</span>
        <span style={{ fontSize: '11px', fontWeight: '500', minWidth: '76px' }}>{inc.sala === 'grande' ? 'Grande' : inc.sala === 'chica' ? 'Chica' : 'Ambas'}{inc.lineas?.length > 0 ? ' · ' + inc.lineas.join(' ') : ''}</span>
        <span style={{ flex: 1, fontSize: '11px', color: '#666' }}>{inc.categoriaNombre}</span>
        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '6px', background: gradoColor[inc.grado] + '22', color: gradoColor[inc.grado], fontWeight: '500' }}>
          {inc.grado}
        </span>
      </div>
      {open && (
        <div style={{ padding: '10px 10px 12px 26px', background: '#fafafa', borderTop: '0.5px solid #f0f0f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '8px' }}>
            <div style={{ background: '#fff', borderRadius: '6px', padding: '5px 8px' }}>
              <div style={{ fontSize: '10px', color: '#999' }}>Responsable</div>
              <div style={{ fontSize: '11px', fontWeight: '500' }}>{inc.sectoresResponsables?.join(', ') || '—'}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '6px', padding: '5px 8px' }}>
              <div style={{ fontSize: '10px', color: '#999' }}>Inicio · Fin</div>
              <div style={{ fontSize: '11px', fontWeight: '500' }}>{inc.horaInicio} · {inc.horaFin || 'pendiente'}</div>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#666', borderLeft: '2px solid #dce8f5', padding: '4px 8px', background: '#fff', borderRadius: '0 6px 6px 0', marginBottom: '8px', lineHeight: '1.5' }}>
            {inc.descripcion}
          </div>
          <div style={{ fontSize: '10px', fontWeight: '500', color: '#888', marginBottom: '4px' }}>Nota de reunión</div>
          {inc.notaReunion
            ? <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic', background: '#fff', borderRadius: '6px', padding: '5px 8px' }}>{inc.notaReunion}</div>
            : <div style={{ fontSize: '11px', color: '#bbb', fontStyle: 'italic', border: '0.5px dashed #ddd', borderRadius: '6px', padding: '5px 8px' }}>Sin nota de reunión</div>
          }
        </div>
      )}
    </div>
  )
}

function SemaforoSectores({ incidencias }) {
  const sectores = ['Sistemas', 'RRHH', 'Calidad', 'Mantenimiento', 'Depósito', 'Automatización', 'Planificación']
  return sectores.map(s => {
    const incs = incidencias.filter(i => i.sectoresResponsables?.includes(s) && !i.eliminado)
    const critica = incs.some(i => i.grado === 'critico')
    const moderada = incs.some(i => i.grado === 'moderado')
    const color = critica ? '#E24B4A' : moderada ? '#BA7517' : '#1D9E75'
    return (
      <div key={s} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: '8px', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }}></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: '500' }}>{s}</div>
          <div style={{ fontSize: '10px', color: '#999' }}>{incs.length > 0 ? `${incs.length} inc.` : 'sin novedades'}</div>
        </div>
      </div>
    )
  })
}
