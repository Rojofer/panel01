import { useState, useEffect, useRef } from 'react'
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from './firebase'
import Drawer from './Drawer'
import Configuracion from './Configuracion'

const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
const gradoBg = { critico: '#fef2f2', moderado: '#fff8ee', leve: '#f0f6ff', informativo: '#edfbf4' }
const gradoLabel = { critico: 'Crítica', moderado: 'Moderada', leve: 'Leve', informativo: 'Info' }

export default function Tablero({ user, userData, onVerInforme }) {
  const [incidencias, setIncidencias] = useState([])
  const [config, setConfig] = useState(null)
  const [turnoId, setTurnoId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [sectores, setSectores] = useState([])
  const [sectorFiltro, setSectorFiltro] = useState(null)
  const [gradoFiltro, setGradoFiltro] = useState(null)
  const [sectorDetalle, setSectorDetalle] = useState(null)
  const [turnoExiste, setTurnoExiste] = useState(false)
  const [modalIniciarTurno, setModalIniciarTurno] = useState(false)
  const [modalHistorial, setModalHistorial] = useState(false)
  const [modalConfig, setModalConfig] = useState(false)
  const [produccion, setProduccion] = useState({})
  const [modalProduccion, setModalProduccion] = useState(null)

  useEffect(() => {
    if (!turnoId) return
    getDocs(collection(db,'turnos',turnoId,'produccion')).then(snap => {
      const data = {}
      snap.docs.forEach(d => { data[d.id] = d.data() })
      setProduccion(data)
    })
  }, [turnoId])
  
  const [horaActual, setHoraActual] = useState('')
  useEffect(() => {
    const tick = () => { const n = new Date(); setHoraActual(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`) }
    tick(); const t = setInterval(tick, 10000); return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const hoy = new Date()
    const id = hoy.toISOString().slice(0,10).replace(/-/g,'') + '_manana'
    setTurnoId(id)
  }, [])

  useEffect(() => {
    getDoc(doc(db,'config','turno')).then(s => s.exists() && setConfig(s.data()))
    getDoc(doc(db,'config','categorias')).then(s => {
      if (s.exists()) setCategorias(Object.entries(s.data()).map(([id,nombre])=>({id,nombre})).sort((a,b)=>a.nombre.localeCompare(b.nombre)))
    })
    getDoc(doc(db,'config','sectores')).then(s => {
      if (s.exists()) setSectores(Object.values(s.data()).sort())
    })
  }, [])

  useEffect(() => {
    if (!turnoId) return
    getDoc(doc(db,'turnos',turnoId)).then(s => setTurnoExiste(s.exists()))
    const q = query(collection(db,'turnos',turnoId,'incidencias'), orderBy('horaInicio','asc'))
    return onSnapshot(q, snap => setIncidencias(snap.docs.map(d=>({id:d.id,...d.data()}))))
  }, [turnoId])

  const activas = incidencias.filter(i => !i.eliminado)
  const franjas = config ? generarFranjas(config) : []
  const incsPorFranja = franjas.reduce((acc,f) => { acc[f]=activas.filter(i=>i.franja===f); return acc }, {})
  const ultimaIncId = activas.length > 0 ? activas[activas.length-1].id : null
  const sectoresConInc = sectores.filter(s => activas.some(i => i.sectoresResponsables?.includes(s)))

  const incsFiltradas = activas
    .filter(i => !sectorFiltro || i.sectoresResponsables?.includes(sectorFiltro))
    .filter(i => !gradoFiltro || i.grado === gradoFiltro)

  const franjasFiltradas = franjas.filter(f => incsFiltradas.filter(i=>i.franja===f).length > 0)

  const tiempoPorCategoria = activas.reduce((acc, i) => {
    if (i.horaInicio && i.horaFin && i.categoriaNombre) {
      const [h1,m1] = i.horaInicio.split(':').map(Number)
      const [h2,m2] = i.horaFin.split(':').map(Number)
      const mins = Math.max(0, (h2*60+m2) - (h1*60+m1))
      acc[i.categoriaNombre] = (acc[i.categoriaNombre] || 0) + mins
    }
    return acc
  }, {})
  const tiempoTotal = Object.values(tiempoPorCategoria).reduce((a,b) => a+b, 0)
  const tiempoOrdenado = Object.entries(tiempoPorCategoria).sort((a,b) => b[1]-a[1]).slice(0,4)
  const catColores = ['#BA7517','#E24B4A','#185FA5','#1D9E75','#888780']

  const gradoCount = { critico: activas.filter(i=>i.grado==='critico').length, moderado: activas.filter(i=>i.grado==='moderado').length, leve: activas.filter(i=>i.grado==='leve').length, informativo: activas.filter(i=>i.grado==='informativo').length }

  async function iniciarTurno() {
    await setDoc(doc(db,'turnos',turnoId), {
      fecha: new Date().toISOString().slice(0,10),
      nombre: 'Mañana',
      estado: 'activo',
      objetivoGrande: config?.objetivoGrande || 350,
      objetivoChica: config?.objetivoChica || 100,
      inicio: config?.inicio || '05:00',
      fin: config?.fin || '14:00',
      creadoEn: serverTimestamp()
    })
    setTurnoExiste(true)
  }

  function toggleGrado(g) { setGradoFiltro(gradoFiltro === g ? null : g) }
  function toggleSector(s) { setSectorFiltro(sectorFiltro === s ? null : s) }

  const hayFiltros = sectorFiltro || gradoFiltro

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', background: '#F7F7F5', minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #EFEFED', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 5 }}>
        <span style={{ fontSize: '16px', fontWeight: '700', color: '#111' }}>Panel de Control</span>
        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#EDFBF4', color: '#1D9E75', fontWeight: '600' }}>Turno activo</span>
        {hayFiltros && (
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            {gradoFiltro && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: gradoBg[gradoFiltro], color: gradoColor[gradoFiltro], fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>{gradoLabel[gradoFiltro]} <span onClick={() => setGradoFiltro(null)} style={{ cursor: 'pointer', opacity: .7 }}>×</span></span>}
            {sectorFiltro && <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#f0f6ff', color: '#185FA5', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>{sectorFiltro} <span onClick={() => setSectorFiltro(null)} style={{ cursor: 'pointer', opacity: .7 }}>×</span></span>}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '24px', fontWeight: '700', color: '#111', letterSpacing: '-0.5px' }}>{horaActual}</span>
          <span style={{ fontSize: '12px', color: '#aaa' }}>{config?.inicio || '05:00'} — {config?.fin || '14:00'}</span>
          {turnoExiste && (
            <button onClick={() => { if(window.confirm('¿Cerrar el turno? No podrás agregar más incidencias.')) { updateDoc(doc(db,'turnos',turnoId),{estado:'cerrado'}); setTurnoExiste(false) } }} style={{ fontSize:'12px', padding:'5px 12px', borderRadius:'8px', border:'1px solid #fde8e8', background:'#fef9f9', cursor:'pointer', color:'#E24B4A', fontWeight:'600' }}>⏹ Cerrar turno</button>
          )}
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>Obj: {config ? (config.objetivoGrande + config.objetivoChica) * franjas.length : '...'} ctos</span>
          {userData.rol === 'owner' && <button onClick={() => setModalConfig(true)} style={{ fontSize:'12px', padding:'5px 12px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#555' }}>⚙️ Config</button>}
          {userData.rol === 'owner' && <button onClick={onVerInforme} style={{ fontSize:'12px', padding:'5px 12px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#555' }}>📊 Informes</button>}
          <button onClick={() => signOut(auth)} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#888' }}>Salir</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px', padding: '16px 24px' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: '#fff', borderRadius: '14px', padding: '14px 16px', border: '1px solid #EFEFED' }}>
              <div style={{ fontSize: '11px', color: '#aaa', fontWeight: '500', marginBottom: '4px' }}>Incidencias del turno</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#E24B4A', lineHeight: 1, marginBottom: '10px' }}>{incsFiltradas.length}{activas.length !== incsFiltradas.length && <span style={{ fontSize: '14px', color: '#aaa', fontWeight: '400', marginLeft: '6px' }}>de {activas.length}</span>}</div>
              {activas.length > 0 && (
                <div style={{ height: '8px', borderRadius: '4px', display: 'flex', overflow: 'hidden', gap: '2px', marginBottom: '10px' }}>
                  {['critico','moderado','leve','informativo'].map(g => gradoCount[g] > 0 && (
                    <div key={g} onClick={() => toggleGrado(g)} style={{ height: '100%', background: gradoColor[g], width: `${Math.round(gradoCount[g]/activas.length*100)}%`, borderRadius: '2px', cursor: 'pointer', opacity: gradoFiltro && gradoFiltro !== g ? 0.3 : 1, transition: 'opacity .15s' }} />
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {['critico','moderado','leve','informativo'].map(g => gradoCount[g] > 0 && (
                  <span key={g} onClick={() => toggleGrado(g)} style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '20px', background: gradoBg[g], color: gradoColor[g], fontWeight: '600', cursor: 'pointer', border: `1.5px solid ${gradoFiltro === g ? gradoColor[g] : 'transparent'}`, opacity: gradoFiltro && gradoFiltro !== g ? 0.4 : 1, transition: 'all .15s' }}>
                    {gradoCount[g]} {gradoLabel[g]}{gradoCount[g] > 1 ? 's' : ''}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: '14px', padding: '14px 16px', border: '1px solid #EFEFED' }}>
              <div style={{ fontSize: '11px', color: '#aaa', fontWeight: '500', marginBottom: '4px' }}>Tiempo perdido</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#BA7517', lineHeight: 1, marginBottom: '10px' }}>
                {tiempoTotal > 0 ? tiempoTotal : '—'}{tiempoTotal > 0 && <span style={{ fontSize: '16px', fontWeight: '500', marginLeft: '4px' }}>min</span>}
              </div>
              {tiempoTotal > 0 ? (
                <>
                  <div style={{ height: '8px', borderRadius: '4px', display: 'flex', overflow: 'hidden', gap: '2px', marginBottom: '10px' }}>
                    {tiempoOrdenado.map(([cat, mins], idx) => (
                      <div key={cat} style={{ height: '100%', background: catColores[idx], width: `${Math.round(mins/tiempoTotal*100)}%`, borderRadius: '2px' }} title={`${cat}: ${mins} min`} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {tiempoOrdenado.map(([cat, mins], idx) => (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#555' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: catColores[idx], flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                        <span style={{ fontWeight: '600', color: '#333' }}>{mins} min</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '11px', color: '#ccc' }}>Registrá hora de fin en las incidencias para ver el tiempo</div>
              )}
            </div>
          </div>

          {!turnoExiste ? (
            <div onClick={() => setModalIniciarTurno(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#fff', border: '1.5px solid #1D9E75', borderRadius: '14px', padding: '16px', cursor: 'pointer', marginBottom: '20px' }}
              onMouseEnter={e => e.currentTarget.style.background='#edfbf4'}
              onMouseLeave={e => e.currentTarget.style.background='#fff'}>
              <span style={{ fontSize: '24px', fontWeight: '300', color: '#1D9E75', lineHeight: 1 }}>▶</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#1D9E75' }}>Iniciar turno de hoy</span>
            </div>
          ) : (
            <div onClick={() => setDrawerOpen('elegir')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#fff', border: '1.5px dashed #d0d0d0', borderRadius: '14px', padding: '16px', cursor: 'pointer', marginBottom: '20px' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='#185FA5'; e.currentTarget.style.background='#f8fbff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='#d0d0d0'; e.currentTarget.style.background='#fff' }}>
              <span style={{ fontSize: '24px', fontWeight: '300', color: '#185FA5', lineHeight: 1 }}>+</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#185FA5' }}>Registrar incidencia</span>
            </div>
          )}

          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #EFEFED', marginBottom:'16px', overflow:'hidden' }}>
            <div style={{ padding:'10px 16px', borderBottom:'1px solid #EFEFED', fontSize:'12px', fontWeight:'600', color:'#555' }}>Producción por franja</div>
            {franjas.map(franja => {
              const prod = produccion[franja]
              const objG = config?.objetivoGrande || 350
              const objC = config?.objetivoChica || 100
              return (
                <div key={franja} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'8px 16px', borderBottom:'1px solid #F5F5F3' }}>
                  <span style={{ fontSize:'12px', fontWeight:'600', color:'#aaa', minWidth:'100px' }}>{franja.replace('-',' — ')}</span>
                  <div style={{ display:'flex', gap:'16px', flex:1 }}>
                    <span style={{ fontSize:'12px', color: prod?.grande != null ? (prod.grande >= objG ? '#1D9E75' : '#E24B4A') : '#ccc' }}>
                      Grande: <strong>{prod?.grande ?? '—'}</strong>{prod?.grande != null && <span style={{ fontSize:'10px', marginLeft:'4px', color:'#aaa' }}>obj {objG}</span>}
                    </span>
                    <span style={{ fontSize:'12px', color: prod?.chica != null ? (prod.chica >= objC ? '#1D9E75' : '#E24B4A') : '#ccc' }}>
                      Chica: <strong>{prod?.chica ?? '—'}</strong>{prod?.chica != null && <span style={{ fontSize:'10px', marginLeft:'4px', color:'#aaa' }}>obj {objC}</span>}
                    </span>
                  </div>
                  <button onClick={() => setModalProduccion(franja)} style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#555', flexShrink:0 }}>
                    {prod ? '✏️' : '+'}
                  </button>
                </div>
              )
            })}
          </div>
          
          {franjasFiltradas.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#ccc', fontSize: '14px' }}>
              {hayFiltros ? 'Sin incidencias con los filtros aplicados' : 'Sin incidencias registradas en el turno'}
            </div>
          )}

          {franjasFiltradas.map(franja => (
            <div key={franja}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', paddingLeft: '2px' }}>
                {franja.replace('-', ' — ')}
              </div>
              {incsFiltradas.filter(i=>i.franja===franja).map(inc => (
                <IncCard key={inc.id} inc={inc} turnoId={turnoId} userData={userData} onEditar={setEditando} onEliminar={setEliminando} defaultOpen={inc.id === ultimaIncId} />
              ))}
              
        <div>
          {sectoresConInc.length > 0 && (
            <>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>
                Sectores · click filtra · doble click detalle
              </div>
              {sectoresConInc.map(s => (
                <SectorCard key={s} sector={s} incs={activas.filter(i => i.sectoresResponsables?.includes(s))} seleccionado={sectorFiltro === s} onClick={() => toggleSector(s)} onDobleClick={() => setSectorDetalle(s)} />
              ))}
            </>
          )}
        </div>
      </div>

      {drawerOpen === 'elegir' && <ModalFranja franjas={franjas} incsPorFranja={incsPorFranja} onSelect={f => setDrawerOpen(f)} onClose={() => setDrawerOpen(false)} />}
      {drawerOpen && drawerOpen !== 'elegir' && <Drawer franja={drawerOpen} turnoId={turnoId} user={user} userData={userData} onClose={() => setDrawerOpen(false)} franjas={franjas} />}
      {editando && <ModalEditar inc={editando} turnoId={turnoId} categorias={categorias} sectores={sectores} userData={userData} onClose={() => setEditando(null)} />}
      {eliminando && userData.rol === 'owner' && <ModalEliminar inc={eliminando} turnoId={turnoId} userData={userData} onClose={() => setEliminando(null)} />}
      {modalConfig && <Configuracion onClose={() => setModalConfig(false)} />}
      {modalProduccion && (
        <ModalProduccion
          franja={modalProduccion}
          inicial={produccion[modalProduccion]}
          onGuardar={async (grande, chica) => {
            const franjaId = modalProduccion.replace(':','').replace(':','').replace('-','_')
            await setDoc(doc(db,'turnos',turnoId,'produccion',franjaId), { franja: modalProduccion, grande, chica, cargadoEn: serverTimestamp() })
            setProduccion(p => ({ ...p, [modalProduccion]: { grande, chica } }))
            setModalProduccion(null)
          }}
          onClose={() => setModalProduccion(null)}
        />
      )}
      {modalHistorial && <ModalHistorial onClose={() => setModalHistorial(false)} turnoIdActual={turnoId} />}
      {modalIniciarTurno && (
        <ModalIniciarTurno
          onConfirm={async (fecha) => {
            const id = fecha.replace(/-/g,'') + '_manana'
            await setDoc(doc(db,'turnos',id), {
              fecha, nombre: 'Mañana', estado: 'activo',
              objetivoGrande: config?.objetivoGrande || 350,
              objetivoChica: config?.objetivoChica || 100,
              inicio: config?.inicio || '05:00',
              fin: config?.fin || '14:00',
              creadoEn: serverTimestamp()
            })
            setTurnoId(id); setTurnoExiste(true); setModalIniciarTurno(false)
          }}
          onClose={() => setModalIniciarTurno(false)}
        />
      )}
      {sectorDetalle && <ModalSector sector={sectorDetalle} incs={activas.filter(i => i.sectoresResponsables?.includes(sectorDetalle))} onClose={() => setSectorDetalle(null)} />}
    </div>
  )
}

function generarFranjas(config) {
  const franjas = []
  const hIni = parseInt(config.inicio)
  const hFin = parseInt(config.fin)
  for (let h = hIni; h < hFin; h++) {
    franjas.push(`${String(h).padStart(2,'0')}:00-${String(h+1).padStart(2,'0')}:00`)
  }
  return franjas
}

function SectorCard({ sector, incs, seleccionado, onClick, onDobleClick }) {
  const clickTimer = useRef(null)
  const critica = incs.some(i => i.grado === 'critico')
  const moderada = incs.some(i => i.grado === 'moderado')
  const color = critica ? '#E24B4A' : moderada ? '#BA7517' : '#1D9E75'

  function handleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      onDobleClick()
    } else {
      clickTimer.current = setTimeout(() => { clickTimer.current = null; onClick() }, 250)
    }
  }

  return (
    <div onClick={handleClick}
      style={{ background: seleccionado ? '#f0f6ff' : '#fff', borderRadius: '12px', border: `1.5px solid ${seleccionado ? '#185FA5' : '#EFEFED'}`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', cursor: 'pointer', transition: 'all .15s' }}
      onMouseEnter={e => { if (!seleccionado) e.currentTarget.style.borderColor='#b5d4f4' }}
      onMouseLeave={e => { if (!seleccionado) e.currentTarget.style.borderColor='#EFEFED' }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: seleccionado ? '#185FA5' : '#222' }}>{sector}</div>
        <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>{incs.length} inc. · {incs.filter(i=>i.grado==='critico').length > 0 ? `${incs.filter(i=>i.grado==='critico').length} crítica` : 'sin críticas'}</div>
      </div>
      <div style={{ fontSize: '10px', color: '#ccc' }}>⋮⋮</div>
    </div>
  )
}

function ModalSector({ sector, incs, onClose }) {
  const criticas = incs.filter(i => i.grado === 'critico')
  const moderadas = incs.filter(i => i.grado === 'moderado')
  const tiempoPerdido = incs.reduce((acc, i) => {
    if (i.horaInicio && i.horaFin) {
      const [h1,m1] = i.horaInicio.split(':').map(Number)
      const [h2,m2] = i.horaFin.split(':').map(Number)
      return acc + Math.max(0, (h2*60+m2) - (h1*60+m1))
    }
    return acc
  }, 0)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '520px', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '28px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '700', color: '#111' }}>{sector}</div>
            <div style={{ fontSize: '13px', color: '#aaa', marginTop: '2px' }}>Detalle del turno</div>
          </div>
          <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', fontSize: '18px', color: '#888' }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '20px' }}>
          {[
            ['Total', incs.length, '#E24B4A'],
            ['Críticas', criticas.length, '#E24B4A'],
            ['Moderadas', moderadas.length, '#BA7517'],
            ['Tiempo', tiempoPerdido > 0 ? tiempoPerdido + 'm' : '—', '#BA7517'],
          ].map(([l,v,c]) => (
            <div key={l} style={{ background: '#F7F7F5', borderRadius: '10px', padding: '12px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '4px', fontWeight: '500' }}>{l}</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: c, lineHeight: 1 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Incidencias</div>
        {incs.map(inc => (
          <div key={inc.id} style={{ background: '#fafafa', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px', border: '1px solid #EFEFED' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: gradoColor[inc.grado], flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: '#aaa', minWidth: '36px' }}>{inc.horaInicio}</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#111', flex: 1 }}>{inc.categoriaNombre}</span>
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: gradoBg[inc.grado], color: gradoColor[inc.grado], fontWeight: '600' }}>{inc.grado}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.5', marginBottom: inc.notaReunion ? '8px' : '0' }}>{inc.descripcion}</div>
            {inc.notaReunion && (
              <div style={{ background: '#FFFBF0', border: '1px solid #F5E6B0', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#7A6000', fontStyle: 'italic', lineHeight: '1.5' }}>{inc.notaReunion}</div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function ModalFranja({ franjas, incsPorFranja, onSelect, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '380px', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '24px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#111' }}>¿En qué franja ocurrió?</div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', fontSize: '16px', color: '#888' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}>
          {franjas.map(f => {
            const cant = incsPorFranja[f]?.length || 0
            const hActual = new Date().getHours()
            const hFranja = parseInt(f.split(':')[0])
            const esActual = hFranja === hActual
            return (
              <div key={f} onClick={() => onSelect(f)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', border: `1.5px solid ${esActual ? '#185FA5' : '#e8e8e8'}`, background: esActual ? '#f0f6ff' : '#fafafa', cursor: 'pointer' }}
                onMouseEnter={e => { if (!esActual) e.currentTarget.style.borderColor='#185FA5' }}
                onMouseLeave={e => { if (!esActual) e.currentTarget.style.borderColor='#e8e8e8' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: esActual ? '700' : '500', color: esActual ? '#185FA5' : '#333' }}>{f.replace('-', ' — ')}</span>
                  {esActual && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: '#185FA5', color: '#fff', fontWeight: '600' }}>ahora</span>}
                </div>
                {cant > 0 ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#fef2f2', color: '#E24B4A', fontWeight: '600' }}>{cant} inc.</span> : <span style={{ fontSize: '11px', color: '#ccc' }}>sin incidencias</span>}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function IncCard({ inc, turnoId, userData, onEditar, onEliminar, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const [notaEdit, setNotaEdit] = useState(false)
  const [nota, setNota] = useState(inc.notaReunion || '')
  const [finEdit, setFinEdit] = useState(false)
  const [horaFin, setHoraFin] = useState(inc.horaFin || '')
  const [saving, setSaving] = useState(false)

  async function guardarNota() {
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id), { notaReunion: nota, notaReunionAutor: userData.nombre, notaReunionEn: serverTimestamp() })
    setSaving(false); setNotaEdit(false)
  }

  async function guardarFin() {
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id), { horaFin })
    setSaving(false); setFinEdit(false)
  }

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #EFEFED', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background='#FAFAFA'}
        onMouseLeave={e => e.currentTarget.style.background='#fff'}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: gradoColor[inc.grado], flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: '#aaa', fontWeight: '500', minWidth: '38px' }}>{inc.horaInicio}</span>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#111', minWidth: '90px' }}>
          {inc.sala === 'grande' ? 'Grande' : inc.sala === 'chica' ? 'Chica' : inc.sala === 'ambas' ? 'Ambas' : '—'}
          {inc.lineas?.length > 0 ? ' · ' + inc.lineas.join(' ') : ''}
        </span>
        <span style={{ flex: 1, fontSize: '13px', color: '#555' }}>{inc.categoriaNombre}</span>
        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: gradoBg[inc.grado], color: gradoColor[inc.grado], fontWeight: '600' }}>{inc.grado}</span>
        <span style={{ fontSize: '11px', color: '#ccc', marginLeft: '4px' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid #F5F5F3' }}>
          <div style={{ fontSize: '13px', color: '#666', padding: '10px 0', borderBottom: '1px solid #F5F5F3', lineHeight: '1.5' }}>{inc.descripcion}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', paddingTop: '10px', marginBottom: '10px' }}>
            {[
              ['Responsable', inc.sectoresResponsables?.join(', ') || (inc.causaExterna ? 'Causa externa' : '—')],
              ['Afectado', inc.sectoresAfectados?.join(', ') || '—'],
              ['Inicio · Fin', `${inc.horaInicio} · ${inc.horaFin || 'pendiente'}`],
            ].map(([l,v]) => (
              <div key={l} style={{ background: '#F7F7F5', borderRadius: '8px', padding: '7px 10px' }}>
                <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '2px' }}>{l}</div>
                <div style={{ fontSize: '12px', fontWeight: '500', color: '#333' }}>{v}</div>
              </div>
            ))}
          </div>
          {!inc.horaFin && !finEdit && <button onClick={() => setFinEdit(true)} style={{ fontSize: '11px', color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px', textDecoration: 'underline' }}>+ Registrar hora de fin</button>}
          {finEdit && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} style={{ fontSize: '13px', borderRadius: '8px', border: '1.5px solid #e8e8e8', padding: '6px 10px', width: '120px' }} />
              <button onClick={guardarFin} disabled={saving} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>Guardar</button>
              <button onClick={() => setFinEdit(false)} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888' }}>Cancelar</button>
            </div>
          )}
          {!notaEdit
            ? inc.notaReunion
              ? <div onClick={() => { setNota(inc.notaReunion); setNotaEdit(true) }} style={{ background: '#FFFBF0', border: '1px solid #F5E6B0', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: '#7A6000', fontStyle: 'italic', lineHeight: '1.5', marginBottom: '10px', cursor: 'pointer' }}>{inc.notaReunion}</div>
              : <div onClick={() => setNotaEdit(true)} style={{ border: '1.5px dashed #e8e8e8', borderRadius: '10px', padding: '9px 12px', fontSize: '12px', color: '#bbb', cursor: 'pointer', marginBottom: '10px' }}>+ Agregar nota de reunión...</div>
            : <div style={{ marginBottom: '10px' }}>
                <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Escribí la respuesta acordada..." style={{ width: '100%', fontSize: '13px', minHeight: '60px', resize: 'vertical', borderRadius: '10px', border: '1.5px solid #185FA5', padding: '8px 12px', fontFamily: 'inherit', marginBottom: '6px' }} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={guardarNota} disabled={saving} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '500' }}>{saving ? 'Guardando...' : 'Guardar nota'}</button>
                  <button onClick={() => setNotaEdit(false)} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888' }}>Cancelar</button>
                </div>
              </div>
          }
          <div style={{ display: 'flex', gap: '6px', paddingTop: '8px', borderTop: '1px solid #F5F5F3' }}>
            <button onClick={() => onEditar(inc)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#555', fontWeight: '500' }}>✏️ Editar</button>
            {userData.rol === 'owner' && <button onClick={() => onEliminar(inc)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #fde8e8', background: '#fef9f9', cursor: 'pointer', color: '#E24B4A', fontWeight: '500' }}>🗑 Eliminar</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function ModalEditar({ inc, turnoId, categorias, sectores, userData, onClose }) {
  const [grado, setGrado] = useState(inc.grado)
  const [descripcion, setDescripcion] = useState(inc.descripcion)
  const [categoria, setCategoria] = useState(inc.categoriaId)
  const [categoriaNombre, setCategoriaNombre] = useState(inc.categoriaNombre)
  const [responsables, setResponsables] = useState(inc.sectoresResponsables || [])
  const [busq, setBusq] = useState('')
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id), { grado, descripcion, categoriaId: categoria, categoriaNombre, sectoresResponsables: responsables, editadoPor: userData.nombre, editadoEn: serverTimestamp() })
    await addDoc(collection(db,'log'), { accion: 'editar_incidencia', turnoId, recursoId: inc.id, usuarioNombre: userData.nombre, datos: { gradoAnterior: inc.grado, descripcionAnterior: inc.descripcion }, timestamp: serverTimestamp() })
    setSaving(false); onClose()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '440px', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '24px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#111' }}>Editar incidencia</div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', fontSize: '16px', color: '#888' }}>×</button>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Categoría</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {categorias.map(c => <button key={c.id} onClick={() => { setCategoria(c.id); setCategoriaNombre(c.nombre) }} style={{ padding: '8px', fontSize: '12px', borderRadius: '8px', border: `1.5px solid ${categoria===c.id?'#185FA5':'#e8e8e8'}`, background: categoria===c.id?'#f0f6ff':'#fafafa', color: categoria===c.id?'#185FA5':'#555', cursor: 'pointer', fontWeight: categoria===c.id?'600':'400' }}>{c.nombre}</button>)}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Grado</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {Object.entries(gradoColor).map(([g,c]) => <button key={g} onClick={() => setGrado(g)} style={{ flex: 1, padding: '8px 4px', fontSize: '11px', fontWeight: grado===g?'700':'400', borderRadius: '8px', border: `1.5px solid ${grado===g?c:'#e8e8e8'}`, background: grado===g?c+'20':'#fafafa', color: grado===g?c:'#888', cursor: 'pointer' }}>{g}</button>)}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Descripción</div>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} style={{ width: '100%', fontSize: '13px', minHeight: '70px', resize: 'vertical', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '10px 12px', fontFamily: 'inherit' }} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Responsables</div>
          <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscá un sector..." style={{ width: '100%', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '8px 12px', marginBottom: '6px' }} />
          {busq && <div style={{ border: '1px solid #e8e8e8', borderRadius: '10px', overflow: 'hidden', marginBottom: '6px', maxHeight: '120px', overflowY: 'auto' }}>
            {sectores.filter(s=>s.toLowerCase().includes(busq.toLowerCase())).map(s => <div key={s} onClick={() => { setResponsables(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]); setBusq('') }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: responsables.includes(s)?'#f0f6ff':'#fff', borderBottom: '1px solid #f5f5f5' }}>{responsables.includes(s)?'✓ ':''}{s}</div>)}
          </div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {responsables.map(r => <span key={r} style={{ fontSize: '12px', padding: '3px 10px 3px 12px', borderRadius: '20px', background: '#f0f6ff', color: '#185FA5', border: '1px solid #b5d4f4', display: 'flex', alignItems: 'center', gap: '4px' }}>{r} <span onClick={() => setResponsables(p=>p.filter(x=>x!==r))} style={{ cursor: 'pointer', opacity: .6 }}>×</span></span>)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', fontWeight: '500' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex: 2, padding: '10px', fontSize: '13px', fontWeight: '700', borderRadius: '10px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>{saving?'Guardando...':'Guardar cambios'}</button>
        </div>
      </div>
    </>
  )
}

function ModalHistorial({ onClose, turnoIdActual }) {
  const [turnos, setTurnos] = useState([])
  const [turnoAbierto, setTurnoAbierto] = useState(null)
  const [incidencias, setIncidencias] = useState([])
  const [logs, setLogs] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    getDocs(collection(db,'turnos')).then(snap => {
      const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.id !== turnoIdActual)
        .sort((a,b) => b.id.localeCompare(a.id))
      setTurnos(lista)
      setCargando(false)
    })
  }, [])

  async function abrirTurno(turnoId) {
    if (turnoAbierto === turnoId) { setTurnoAbierto(null); setIncidencias([]); return }
    setTurnoAbierto(turnoId)
    const snap = await getDocs(query(collection(db,'turnos',turnoId,'incidencias'), orderBy('horaInicio','asc')))
    setIncidencias(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.eliminado))
    const logSnap = await getDocs(query(collection(db,'log'), orderBy('timestamp','desc')))
    setLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.turnoId === turnoId))
  }

  const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
  const gradoBg = { critico: '#fef2f2', moderado: '#fff8ee', leve: '#f0f6ff', informativo: '#edfbf4' }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', zIndex:20 }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'580px', maxHeight:'85vh', overflowY:'auto', background:'#fff', borderRadius:'18px', zIndex:21, padding:'28px', fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <div style={{ fontSize:'18px', fontWeight:'700', color:'#111' }}>Historial de turnos</div>
          <button onClick={onClose} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', fontSize:'18px', color:'#888' }}>×</button>
        </div>

        {cargando && <div style={{ textAlign:'center', color:'#aaa', padding:'2rem' }}>Cargando...</div>}
        {!cargando && turnos.length === 0 && <div style={{ textAlign:'center', color:'#ccc', padding:'2rem' }}>Sin turnos anteriores</div>}

        {turnos.map(t => {
          const abierto = turnoAbierto === t.id
          return (
            <div key={t.id} style={{ marginBottom:'8px', border:'1px solid #EFEFED', borderRadius:'12px', overflow:'hidden' }}>
              <div onClick={() => abrirTurno(t.id)} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', cursor:'pointer', background: abierto ? '#f8fbff' : '#fff' }}
                onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                onMouseLeave={e => e.currentTarget.style.background= abierto ? '#f8fbff' : '#fff'}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'14px', fontWeight:'600', color:'#111' }}>{t.fecha}</div>
                  <div style={{ fontSize:'11px', color:'#aaa', marginTop:'2px' }}>{t.inicio || '05:00'} — {t.fin || '14:00'} · {t.estado === 'cerrado' ? 'Cerrado' : 'Activo'}</div>
                </div>
                <span style={{ fontSize:'11px', color:'#ccc' }}>{abierto ? '▲' : '▼'}</span>
              </div>

              {abierto && (
                <div style={{ borderTop:'1px solid #F5F5F3', padding:'12px 16px' }}>
                  {incidencias.length === 0
                    ? <div style={{ color:'#ccc', fontSize:'13px', textAlign:'center', padding:'1rem' }}>Sin incidencias</div>
                    : incidencias.map(inc => (
                      <div key={inc.id} style={{ background:'#fafafa', borderRadius:'10px', padding:'10px 14px', marginBottom:'8px', border:'1px solid #EFEFED' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom: inc.descripcion ? '6px' : '0' }}>
                          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:gradoColor[inc.grado], flexShrink:0 }} />
                          <span style={{ fontSize:'12px', color:'#aaa', minWidth:'36px' }}>{inc.horaInicio}</span>
                          <span style={{ fontSize:'13px', fontWeight:'600', color:'#111', flex:1 }}>{inc.categoriaNombre}</span>
                          <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', background:gradoBg[inc.grado], color:gradoColor[inc.grado], fontWeight:'600' }}>{inc.grado}</span>
                        </div>
                        {inc.descripcion && <div style={{ fontSize:'12px', color:'#666', lineHeight:'1.5', marginBottom: inc.notaReunion ? '6px' : '0', paddingLeft:'16px' }}>{inc.descripcion}</div>}
                        {inc.notaReunion && <div style={{ background:'#FFFBF0', border:'1px solid #F5E6B0', borderRadius:'8px', padding:'7px 10px', fontSize:'11px', color:'#7A6000', fontStyle:'italic', marginLeft:'16px' }}>{inc.notaReunion}</div>}
                      </div>
                    ))
                  }

                  {logs.filter(l => l.turnoId === t.id).length > 0 && (
                    <div style={{ marginTop:'12px', borderTop:'1px solid #F5F5F3', paddingTop:'12px' }}>
                      <div style={{ fontSize:'11px', fontWeight:'600', color:'#aaa', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'8px' }}>Log de cambios</div>
                      {logs.filter(l => l.turnoId === t.id).map(l => (
                        <div key={l.id} style={{ display:'flex', gap:'8px', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #F5F5F3', fontSize:'12px' }}>
                          <span style={{ padding:'2px 7px', borderRadius:'6px', background: l.accion==='eliminar_incidencia'?'#fef2f2':'#f0f6ff', color: l.accion==='eliminar_incidencia'?'#E24B4A':'#185FA5', fontWeight:'600', flexShrink:0, fontSize:'10px' }}>
                            {l.accion === 'eliminar_incidencia' ? 'Eliminó' : 'Editó'}
                          </span>
                          <span style={{ flex:1, color:'#555' }}>{l.datos?.categoria || l.datos?.descripcionAnterior?.slice(0,40)}{l.datos?.motivo ? ` · "${l.datos.motivo}"` : ''}</span>
                          <span style={{ color:'#aaa', flexShrink:0 }}>{l.usuarioNombre}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function ModalProduccion({ franja, inicial, onGuardar, onClose }) {
  const [grande, setGrande] = useState(inicial?.grande ?? '')
  const [chica, setChica] = useState(inicial?.chica ?? '')
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setSaving(true)
    await onGuardar(grande === '' ? null : Number(grande), chica === '' ? null : Number(chica))
    setSaving(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', zIndex:20 }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'340px', background:'#fff', borderRadius:'18px', zIndex:21, padding:'24px', fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize:'17px', fontWeight:'700', color:'#111', marginBottom:'4px' }}>Producción</div>
        <div style={{ fontSize:'13px', color:'#aaa', marginBottom:'20px' }}>Franja {franja.replace('-',' — ')}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'20px' }}>
          <div>
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#555', marginBottom:'6px' }}>Sala grande (ctos)</div>
            <input type="number" value={grande} onChange={e => setGrande(e.target.value)} placeholder="0" style={{ width:'100%', fontSize:'16px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'10px 12px', textAlign:'center' }} />
          </div>
          <div>
            <div style={{ fontSize:'12px', fontWeight:'600', color:'#555', marginBottom:'6px' }}>Sala chica (ctos)</div>
            <input type="number" value={chica} onChange={e => setChica(e.target.value)} placeholder="0" style={{ width:'100%', fontSize:'16px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'10px 12px', textAlign:'center' }} />
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'10px', fontSize:'13px', borderRadius:'10px', border:'1.5px solid #e8e8e8', background:'#fff', cursor:'pointer', color:'#888', fontWeight:'500' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex:2, padding:'10px', fontSize:'13px', fontWeight:'700', borderRadius:'10px', background:'#185FA5', color:'#fff', border:'none', cursor:'pointer' }}>{saving?'Guardando...':'Guardar'}</button>
        </div>
      </div>
    </>
  )
}

function ModalIniciarTurno({ onConfirm, onClose }) {
  const hoy = new Date().toISOString().slice(0,10)
  const [fecha, setFecha] = useState(hoy)
  const [saving, setSaving] = useState(false)

  async function confirmar() {
    setSaving(true)
    await onConfirm(fecha)
    setSaving(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.3)', zIndex:20 }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'360px', background:'#fff', borderRadius:'18px', zIndex:21, padding:'28px', fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize:'18px', fontWeight:'700', color:'#111', marginBottom:'6px' }}>Iniciar turno</div>
        <div style={{ fontSize:'13px', color:'#aaa', marginBottom:'20px' }}>¿Para qué fecha es este turno?</div>
        <div style={{ marginBottom:'20px' }}>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'#555', marginBottom:'8px' }}>Fecha de inicio del turno</div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width:'100%', fontSize:'14px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'10px 12px' }} />
        </div>
        <div style={{ background:'#f0f6ff', border:'1px solid #b5d4f4', borderRadius:'10px', padding:'10px 14px', fontSize:'12px', color:'#185FA5', marginBottom:'20px' }}>
          El turno puede extenderse más allá de la medianoche — las incidencias quedan bajo esta fecha.
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={onClose} style={{ flex:1, padding:'10px', fontSize:'13px', borderRadius:'10px', border:'1.5px solid #e8e8e8', background:'#fff', cursor:'pointer', color:'#888', fontWeight:'500' }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving||!fecha} style={{ flex:2, padding:'10px', fontSize:'13px', fontWeight:'700', borderRadius:'10px', background:'#1D9E75', color:'#fff', border:'none', cursor:'pointer' }}>{saving?'Iniciando...':'Iniciar turno'}</button>
        </div>
      </div>
    </>
  )
}

function ModalEliminar({ inc, turnoId, userData, onClose }) {
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirmar() {
    if (!motivo.trim()) return
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id), { eliminado: true, eliminadoPor: userData.nombre, eliminadoEn: serverTimestamp(), motivoEliminacion: motivo })
    await addDoc(collection(db,'log'), { accion: 'eliminar_incidencia', turnoId, recursoId: inc.id, usuarioNombre: userData.nombre, datos: { categoria: inc.categoriaNombre, motivo }, timestamp: serverTimestamp() })
    setSaving(false); onClose()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '400px', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '24px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: '#111', marginBottom: '6px' }}>Eliminar incidencia</div>
        <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '16px' }}>Esta acción queda registrada. No se puede deshacer.</div>
        <div style={{ background: '#fef2f2', border: '1px solid #fde8e8', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#333' }}><strong>{inc.categoriaNombre}</strong> · {inc.horaInicio} · {inc.grado}</div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Motivo <span style={{ color: '#E24B4A' }}>*</span></div>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="¿Por qué se elimina?" style={{ width: '100%', fontSize: '13px', minHeight: '60px', resize: 'vertical', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '8px 12px', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', fontWeight: '500' }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving||!motivo.trim()} style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '700', borderRadius: '10px', background: motivo.trim()?'#E24B4A':'#f5a5a5', color: '#fff', border: 'none', cursor: motivo.trim()?'pointer':'not-allowed' }}>{saving?'Eliminando...':'Confirmar'}</button>
        </div>
      </div>
    </>
  )
}
