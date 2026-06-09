import { useState, useEffect, useRef } from 'react'
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from './firebase'
import Drawer from './Drawer'
import Configuracion from './Configuracion'
import Produccion from './Produccion'

const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
const gradoBg = { critico: '#fef2f2', moderado: '#fff8ee', leve: '#f0f6ff', informativo: '#edfbf4' }
const gradoLabel = { critico: 'Crítica', moderado: 'Moderada', leve: 'Leve', informativo: 'Info' }

export default function Tablero({ user, userData, onVerInforme }) {
  const [incidencias, setIncidencias] = useState([])
  const [config, setConfig] = useState(null)
  const [turnoId, setTurnoId] = useState('')
  const [turnoExiste, setTurnoExiste] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [sectores, setSectores] = useState([])
  const [sectorFiltro, setSectorFiltro] = useState(null)
  const [gradoFiltro, setGradoFiltro] = useState(null)
  const [sectorDetalle, setSectorDetalle] = useState(null)
  const [modalIniciarTurno, setModalIniciarTurno] = useState(false)
  const [modalHistorial, setModalHistorial] = useState(false)
  const [modalConfig, setModalConfig] = useState(false)
  const [panelProduccion, setPanelProduccion] = useState(false)
  const [horaActual, setHoraActual] = useState('')
  const [produccion, setProduccion] = useState({})
  const [graficosExpandido, setGraficosExpandido] = useState(false)
  const [incidenciasExpandido, setIncidenciasExpandido] = useState(true)

  useEffect(() => {
    const tick = () => { const n = new Date(); setHoraActual(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`) }
    tick(); const t = setInterval(tick, 10000); return () => clearInterval(t)
  }, [])

  useEffect(() => {
    // Buscar el turno de hoy — por fecha, sin importar estado
    const hoy = new Date()
    // Usar fecha local (no UTC) para evitar desfase horario
    const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`
    const fechaAyer = (() => { const d = new Date(hoy); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
    const idManana = fechaStr.replace(/-/g,'') + '_manana'

    getDocs(collection(db,'turnos')).then(snap => {
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Buscar turno de hoy, si no de ayer (turno nocturno que sigue activo)
      const turnosHoy = todos.filter(t => t.fecha === fechaStr).sort((a,b) => b.id.localeCompare(a.id))
      const turnosAyer = todos.filter(t => t.fecha === fechaAyer && t.estado === 'activo').sort((a,b) => b.id.localeCompare(a.id))
      const encontrado = turnosHoy[0] || turnosAyer[0]
      setTurnoId(encontrado ? encontrado.id : idManana)
    })
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
    const unsub = onSnapshot(q, snap => setIncidencias(snap.docs.map(d=>({id:d.id,...d.data()}))))
    getDocs(collection(db,'turnos',turnoId,'produccion')).then(snap => {
      const prod = {}
      snap.docs.forEach(d => { const data = d.data(); prod[data.franja] = data })
      setProduccion(prod)
    })
    return unsub
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
    if (i.grado === 'informativo') return acc
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

  const gradoCount = {
    critico: activas.filter(i=>i.grado==='critico').length,
    moderado: activas.filter(i=>i.grado==='moderado').length,
    leve: activas.filter(i=>i.grado==='leve').length,
    informativo: activas.filter(i=>i.grado==='informativo').length
  }

  function toggleGrado(g) { setGradoFiltro(gradoFiltro === g ? null : g) }
  function toggleSector(s) { setSectorFiltro(sectorFiltro === s ? null : s) }

  async function iniciarTurno() {
    await setDoc(doc(db,'turnos',turnoId), {
      fecha: new Date().toISOString().slice(0,10),
      nombre: 'Mañana', estado: 'activo',
      objetivoGrande: config?.objetivoGrande || 350,
      objetivoChica: config?.objetivoChica || 100,
      inicio: config?.inicio || '05:00',
      fin: config?.fin || '14:00',
      creadoEn: serverTimestamp()
    })
    setTurnoExiste(true)
  }

  const hayFiltros = sectorFiltro || gradoFiltro
  const semana = (() => { const d = new Date(); const s = new Date(d.getFullYear(), 0, 1); return Math.ceil(((d - s) / 86400000 + s.getDay() + 1) / 7) })()
  const objG = config?.objetivoGrande || 350
  const objC = config?.objetivoChica || 100

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#F4F4F1', minHeight: '100vh' }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E8E5', padding: '0 20px', height: '54px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 5, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#111', color: '#fff', borderRadius: '7px', padding: '3px 7px', lineHeight: 1 }}>
            <span style={{ fontSize: '7px', fontWeight: '600', letterSpacing: '.1em', opacity: .6, textTransform: 'uppercase' }}>SEM</span>
            <span style={{ fontSize: '16px', fontWeight: '800' }}>{semana}</span>
          </div>
          <span style={{ fontSize: '26px', fontWeight: '700', color: '#111', letterSpacing: '-1px', lineHeight: 1 }}>{horaActual}</span>
          <span style={{ fontSize: '11px', color: '#bbb' }}>{config?.inicio || '05:00'} — {config?.fin || '14:00'}</span>
        </div>
        {turnoExiste && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: '#EDFBF4', color: '#1D9E75', fontWeight: '700', letterSpacing: '.04em', textTransform: 'uppercase', flexShrink: 0 }}>Turno activo</span>}
        {turnoExiste && (
          <button onClick={() => setDrawerOpen('elegir')} title="Registrar incidencia"
            style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: '#185FA5', color: '#fff', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0, boxShadow: '0 2px 6px rgba(24,95,165,0.3)' }}>+</button>
        )}
        {hayFiltros && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {gradoFiltro && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: gradoBg[gradoFiltro], color: gradoColor[gradoFiltro], fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>{gradoLabel[gradoFiltro]} <span onClick={() => setGradoFiltro(null)} style={{ cursor: 'pointer', opacity: .6 }}>×</span></span>}
            {sectorFiltro && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: '#f0f6ff', color: '#185FA5', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>{sectorFiltro} <span onClick={() => setSectorFiltro(null)} style={{ cursor: 'pointer', opacity: .6 }}>×</span></span>}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px', alignItems: 'center' }}>
          {turnoExiste && <button onClick={() => { if(window.confirm('¿Cerrar el turno?')) { updateDoc(doc(db,'turnos',turnoId),{estado:'cerrado'}); setTurnoExiste(false) } }} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid #fde8e8', background: '#fef9f9', cursor: 'pointer', color: '#E24B4A', fontWeight: '600' }}>⏹ Cerrar turno</button>}
          <button onClick={() => setPanelProduccion(true)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#555' }}>📦 Producción</button>
          <button onClick={() => setModalHistorial(true)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#555' }}>📋 Historial</button>
          {userData.rol === 'owner' && <button onClick={() => setModalConfig(true)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#555' }}>⚙️ Config</button>}
          {userData.rol === 'owner' && <button onClick={onVerInforme} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#555' }}>📊 Informes</button>}
          <button onClick={() => signOut(auth)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#999' }}>Salir</button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display: 'grid', gridTemplateColumns: sectoresConInc.length > 0 ? '1fr 260px' : '1fr', minHeight: 'calc(100vh - 54px)' }}>
        <div style={{ borderRight: sectoresConInc.length > 0 ? '1px solid #E8E8E5' : 'none' }}>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: '#E8E8E5', borderBottom: '1px solid #E8E8E5' }}>

            {/* incidencias */}
            <div style={{ background: '#fff', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Incidencias del turno</div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: '#E24B4A', lineHeight: 1, marginBottom: '10px' }}>
                {incsFiltradas.length}{activas.length !== incsFiltradas.length && <span style={{ fontSize: '13px', color: '#bbb', fontWeight: '400', marginLeft: '6px' }}>de {activas.length}</span>}
              </div>
              {activas.length > 0 && <div style={{ height: '5px', borderRadius: '3px', display: 'flex', overflow: 'hidden', gap: '2px', marginBottom: '8px' }}>
                {['critico','moderado','leve','informativo'].map(g => gradoCount[g] > 0 && <div key={g} onClick={() => toggleGrado(g)} style={{ height: '100%', background: gradoColor[g], width: `${Math.round(gradoCount[g]/activas.length*100)}%`, borderRadius: '2px', cursor: 'pointer', opacity: gradoFiltro && gradoFiltro !== g ? 0.25 : 1 }} />)}
              </div>}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {['critico','moderado','leve','informativo'].map(g => gradoCount[g] > 0 && <span key={g} onClick={() => toggleGrado(g)} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: gradoBg[g], color: gradoColor[g], fontWeight: '700', cursor: 'pointer', border: `1.5px solid ${gradoFiltro === g ? gradoColor[g] : 'transparent'}`, opacity: gradoFiltro && gradoFiltro !== g ? 0.35 : 1 }}>{gradoCount[g]} {gradoLabel[g]}{gradoCount[g] > 1 ? 's' : ''}</span>)}
              </div>
            </div>

            {/* tiempo perdido */}
            <div style={{ background: '#fff', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Tiempo perdido</div>
              <div style={{ fontSize: '32px', fontWeight: '800', color: tiempoTotal > 0 ? '#BA7517' : '#ddd', lineHeight: 1, marginBottom: '10px' }}>
                {tiempoTotal > 0 ? <>{tiempoTotal}<span style={{ fontSize: '13px', fontWeight: '500', marginLeft: '3px' }}>min</span></> : '—'}
              </div>
              {tiempoTotal > 0 ? (
                <>
                  <div style={{ height: '5px', borderRadius: '3px', display: 'flex', overflow: 'hidden', gap: '2px', marginBottom: '8px' }}>
                    {tiempoOrdenado.map(([cat, mins], idx) => <div key={cat} style={{ height: '100%', background: catColores[idx], width: `${Math.round(mins/tiempoTotal*100)}%`, borderRadius: '2px' }} />)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {tiempoOrdenado.map(([cat, mins], idx) => (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#555' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: catColores[idx], flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                        <span style={{ fontWeight: '700', color: '#333' }}>{mins}m</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <div style={{ fontSize: '10px', color: '#ccc' }}>Registrá hora de fin para ver el tiempo</div>}
            </div>

            {/* total producido */}
            <div style={{ background: '#fff', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Total producido</div>
              {(() => {
                const totalG = Object.values(produccion).reduce((a,p) => a + (p.grande || 0), 0)
                const totalC = Object.values(produccion).reduce((a,p) => a + (p.chica || 0), 0)
                const total = totalG + totalC
                const franjasProd = config ? generarFranjas(config) : []
                const objTotal = (objG + objC) * franjasProd.length
                const pct = objTotal > 0 ? Math.round(total / objTotal * 100) : 0
                const delta = total - objTotal
                return total > 0 ? (
                  <>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#111', lineHeight: 1, marginBottom: '6px' }}>{total.toLocaleString('es-AR')}</div>
                    <div style={{ fontSize: '10px', color: '#bbb', marginBottom: '6px' }}>de {objTotal.toLocaleString('es-AR')} objetivo</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '18px', fontWeight: '800', color: pct >= 100 ? '#1D9E75' : '#E24B4A' }}>{pct}%</span>
                      <span style={{ fontSize: '10px', color: pct >= 100 ? '#1D9E75' : '#E24B4A', fontWeight: '700' }}>{delta >= 0 ? '+' : ''}{delta.toLocaleString('es-AR')} cuartos</span>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '32px', fontWeight: '800', color: '#ddd', lineHeight: 1 }}>—</div>
                )
              })()}
            </div>
          </div>

          {/* iniciar turno */}
          {!turnoExiste && (
            <div onClick={() => setModalIniciarTurno(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#fff', borderBottom: '1px solid #E8E8E5', padding: '14px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background='#edfbf4'}
              onMouseLeave={e => e.currentTarget.style.background='#fff'}>
              <span style={{ fontSize: '18px', color: '#1D9E75' }}>▶</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#1D9E75' }}>Iniciar turno de hoy</span>
            </div>
          )}

          {/* gráficos hora a hora — colapsable */}
          {turnoExiste && (
            <div style={{ borderBottom: '1px solid #E8E8E5' }}>
              <div onClick={() => setGraficosExpandido(!graficosExpandido)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', cursor: 'pointer', background: '#fff', userSelect: 'none' }}
                onMouseEnter={e => e.currentTarget.style.background='#FAFAF8'}
                onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                <span style={{ fontSize: '10px', fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: '.08em' }}>Producción hora a hora</span>
                <span style={{ fontSize: '10px', color: '#ccc', transform: graficosExpandido ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform .2s' }}>▼</span>
              </div>
              {graficosExpandido && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#fff', padding: '0 0 12px 0' }}>
                  {[{ label: 'Sala grande', sala: 'grande', obj: objG }, { label: 'Sala chica', sala: 'chica', obj: objC }].map(({ label, sala, obj }) => (
                    <div key={sala} style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '4px' }}>{label}</div>
                      <GraficoHoraAHora franjas={config ? generarFranjas(config) : []} produccion={produccion} objetivo={obj} config={config} sala={sala} />
                      <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
                        {[['#1D9E75','Sobre obj.'],['#E24B4A','Bajo obj.'],['#B0B0A8','Descanso']].map(([c,t]) => (
                          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#aaa' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: c, display: 'inline-block' }} />{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* incidencias — colapsable */}
          <div>
            <div onClick={() => setIncidenciasExpandido(!incidenciasExpandido)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', cursor: 'pointer', background: '#fff', borderBottom: '1px solid #E8E8E5', userSelect: 'none' }}
              onMouseEnter={e => e.currentTarget.style.background='#FAFAF8'}
              onMouseLeave={e => e.currentTarget.style.background='#fff'}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Incidencias {hayFiltros ? `(${incsFiltradas.length} filtradas)` : `(${activas.length})`}
              </span>
              <span style={{ fontSize: '10px', color: '#ccc', transform: incidenciasExpandido ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform .2s' }}>▼</span>
            </div>
            {incidenciasExpandido && (
              <div style={{ padding: '12px 18px' }}>
                {franjasFiltradas.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem', color: '#ccc', fontSize: '13px' }}>
                    {hayFiltros ? 'Sin incidencias con los filtros aplicados' : 'Sin incidencias registradas en el turno'}
                  </div>
                ) : franjasFiltradas.map(franja => (
                  <div key={franja} style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#bbb', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' }}>
                      {franja.replace('-', ' — ')}
                    </div>
                    {incsFiltradas.filter(i=>i.franja===franja).map(inc => (
                      <IncCard key={inc.id} inc={inc} turnoId={turnoId} userData={userData} onEditar={setEditando} onEliminar={setEliminando} defaultOpen={inc.id === ultimaIncId} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* panel sectores */}
        {sectoresConInc.length > 0 && (
          <div style={{ padding: '16px 14px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#bbb', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '10px' }}>Sectores · click filtra · doble click detalle</div>
            {sectoresConInc.map(s => (
              <SectorCard key={s} sector={s} incs={activas.filter(i => i.sectoresResponsables?.includes(s))} seleccionado={sectorFiltro === s} onClick={() => toggleSector(s)} onDobleClick={() => setSectorDetalle(s)} />
            ))}
          </div>
        )}
      </div>

      {drawerOpen === 'elegir' && <ModalFranja franjas={franjas} incsPorFranja={incsPorFranja} onSelect={f => setDrawerOpen(f)} onClose={() => setDrawerOpen(false)} />}
      {drawerOpen && drawerOpen !== 'elegir' && <Drawer franja={drawerOpen} turnoId={turnoId} user={user} userData={userData} onClose={() => setDrawerOpen(false)} franjas={franjas} />}
      {editando && <ModalEditar inc={editando} turnoId={turnoId} categorias={categorias} sectores={sectores} userData={userData} onClose={() => setEditando(null)} />}
      {eliminando && userData.rol === 'owner' && <ModalEliminar inc={eliminando} turnoId={turnoId} userData={userData} onClose={() => setEliminando(null)} />}
      {sectorDetalle && <ModalSector sector={sectorDetalle} incs={activas.filter(i => i.sectoresResponsables?.includes(sectorDetalle))} onClose={() => setSectorDetalle(null)} />}
      {modalConfig && <Configuracion onClose={() => setModalConfig(false)} />}
      
      {panelProduccion && <Produccion turnoId={turnoId} config={config} onClose={() => setPanelProduccion(false)} />}
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
    </div>
  )
}


function getDescansoParcial(franja, config) {
  if (!config) return 0
  const hFranja = parseInt(franja.split(':')[0])
  let minDesc = 0
  for (const d of [
    { hora: config.descanso1Hora, min: config.descanso1Min || 0, dur: config.descanso1Dur || 0 },
    { hora: config.descanso2Hora, min: config.descanso2Min || 0, dur: config.descanso2Dur || 0 },
  ]) {
    if (d.hora === undefined || d.dur === 0) continue
    const dIni = d.hora * 60 + d.min
    const dFin = dIni + d.dur
    const fIni = hFranja * 60
    const fFin = fIni + 60
    minDesc += Math.max(0, Math.min(dFin, fFin) - Math.max(dIni, fIni))
  }
  return minDesc
}

function GraficoHoraAHora({ franjas, produccion, objetivo, config, sala }) {
  const W = 500, H = 160, PT = 26, PB = 34, PX = 4
  const n = franjas.length
  if (n === 0) return null
  const slot = (W - PX * 2) / n
  const barW = Math.max(10, Math.floor(slot) - 4)
  const chartH = H - PT - PB

  function objFranja(franja) {
    const mDesc = getDescansoParcial(franja, config)
    return Math.round(objetivo * (60 - mDesc) / 60)
  }

  const vals = franjas.map(f => produccion[f]?.[sala]).filter(v => v != null)
  const maxVal = Math.max(...franjas.map(f => objFranja(f)), ...vals, 1) * 1.35

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {franjas.map((franja, i) => {
        const x = PX + i * slot
        const xc = x + slot / 2
        const mDesc = getDescansoParcial(franja, config)
        const objF = objFranja(franja)
        const yObj = PT + chartH - Math.round((objF / maxVal) * chartH)
        const val = produccion[franja]?.[sala]
        const hora = franja.split(':')[0].replace(/^0/, '')
        const lineEl = <line key={`l${i}`} x1={x+1} y1={yObj} x2={x+barW+1} y2={yObj} stroke="#C8B89A" strokeWidth="1.2" strokeDasharray="3 2" />
        if (val == null) return (
          <g key={franja}>{lineEl}
            <text x={xc} y={H-PB+14} textAnchor="middle" fontSize="10" fill="#CCC" fontFamily="system-ui">{hora}</text>
          </g>
        )
        const sobre = val >= objF
        const color = sobre ? '#1D9E75' : '#E24B4A'
        const bH = Math.max(6, Math.round((val / maxVal) * chartH))
        const delta = val - objF
        const overlayH = Math.round(bH * (mDesc / 60))
        return (
          <g key={franja}>
            {lineEl}
            <rect x={x+2} y={PT+chartH-bH} width={barW} height={bH} fill={color} rx="3" opacity=".88" />
            {mDesc > 0 && overlayH > 0 && <rect x={x+2} y={PT+chartH-bH} width={barW} height={overlayH} fill="#B0B0A8" rx="3" opacity=".75" />}
            <text x={xc} y={PT+chartH-bH-5} textAnchor="middle" fontSize="11" fill={color} fontWeight="700" fontFamily="system-ui">{val}</text>
            <text x={xc} y={H-PB+14} textAnchor="middle" fontSize="10" fill="#888" fontFamily="system-ui">{hora}</text>
            <text x={xc} y={H-PB+24} textAnchor="middle" fontSize="9" fill={sobre?'#1D9E75':'#E24B4A'} fontWeight="700" fontFamily="system-ui">{delta>=0?`+${delta}`:delta}</text>
          </g>
        )
      })}
    </svg>
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
          {[['Total', incs.length, '#E24B4A'], ['Críticas', criticas.length, '#E24B4A'], ['Moderadas', moderadas.length, '#BA7517'], ['Tiempo', tiempoPerdido > 0 ? tiempoPerdido+'m' : '—', '#BA7517']].map(([l,v,c]) => (
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
            {inc.notaReunion && <div style={{ background: '#FFFBF0', border: '1px solid #F5E6B0', borderRadius: '8px', padding: '8px 10px', fontSize: '11px', color: '#7A6000', fontStyle: 'italic', lineHeight: '1.5' }}>{inc.notaReunion}</div>}
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '340px', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '24px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: '#111', marginBottom: '4px' }}>Producción</div>
        <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '20px' }}>Franja {franja.replace('-', ' — ')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Sala grande (ctos)</div>
            <input type="number" value={grande} onChange={e => setGrande(e.target.value)} placeholder="0" style={{ width: '100%', fontSize: '16px', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '10px 12px', textAlign: 'center' }} />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Sala chica (ctos)</div>
            <input type="number" value={chica} onChange={e => setChica(e.target.value)} placeholder="0" style={{ width: '100%', fontSize: '16px', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '10px 12px', textAlign: 'center' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', fontWeight: '500' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex: 2, padding: '10px', fontSize: '13px', fontWeight: '700', borderRadius: '10px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>{saving?'Guardando...':'Guardar'}</button>
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
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.id !== turnoIdActual).sort((a,b) => b.id.localeCompare(a.id))
      setTurnos(lista)
      setCargando(false)
    })
  }, [])

  async function abrirTurno(turnoId) {
    if (turnoAbierto === turnoId) { setTurnoAbierto(null); setIncidencias([]); setLogs([]); return }
    setTurnoAbierto(turnoId)
    const [incSnap, logSnap] = await Promise.all([
      getDocs(query(collection(db,'turnos',turnoId,'incidencias'), orderBy('horaInicio','asc'))),
      getDocs(query(collection(db,'log'), orderBy('timestamp','desc')))
    ])
    setIncidencias(incSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.eliminado))
    setLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.turnoId === turnoId))
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '580px', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '28px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#111' }}>Historial de turnos</div>
          <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', fontSize: '18px', color: '#888' }}>×</button>
        </div>
        {cargando && <div style={{ textAlign: 'center', color: '#aaa', padding: '2rem' }}>Cargando...</div>}
        {!cargando && turnos.length === 0 && <div style={{ textAlign: 'center', color: '#ccc', padding: '2rem' }}>Sin turnos anteriores</div>}
        {turnos.map(t => {
          const abierto = turnoAbierto === t.id
          return (
            <div key={t.id} style={{ marginBottom: '8px', border: '1px solid #EFEFED', borderRadius: '12px', overflow: 'hidden' }}>
              <div onClick={() => abrirTurno(t.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer', background: abierto ? '#f8fbff' : '#fff' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#111' }}>{t.fecha}</div>
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>{t.inicio || '05:00'} — {t.fin || '14:00'} · {t.estado === 'cerrado' ? 'Cerrado' : 'Activo'}</div>
                </div>
                <span style={{ fontSize: '11px', color: '#ccc' }}>{abierto ? '▲' : '▼'}</span>
              </div>
              {abierto && (
                <div style={{ borderTop: '1px solid #F5F5F3', padding: '12px 16px' }}>
                  {incidencias.length === 0
                    ? <div style={{ color: '#ccc', fontSize: '13px', textAlign: 'center', padding: '1rem' }}>Sin incidencias</div>
                    : incidencias.map(inc => (
                      <div key={inc.id} style={{ background: '#fafafa', borderRadius: '10px', padding: '10px 14px', marginBottom: '8px', border: '1px solid #EFEFED' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: inc.descripcion ? '6px' : '0' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: gradoColor[inc.grado], flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', color: '#aaa', minWidth: '36px' }}>{inc.horaInicio}</span>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#111', flex: 1 }}>{inc.categoriaNombre}</span>
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: gradoBg[inc.grado], color: gradoColor[inc.grado], fontWeight: '600' }}>{inc.grado}</span>
                        </div>
                        {inc.descripcion && <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.5', marginBottom: inc.notaReunion ? '6px' : '0', paddingLeft: '16px' }}>{inc.descripcion}</div>}
                        {inc.notaReunion && <div style={{ background: '#FFFBF0', border: '1px solid #F5E6B0', borderRadius: '8px', padding: '7px 10px', fontSize: '11px', color: '#7A6000', fontStyle: 'italic', marginLeft: '16px' }}>{inc.notaReunion}</div>}
                      </div>
                    ))
                  }
                  {logs.length > 0 && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid #F5F5F3', paddingTop: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Log de cambios</div>
                      {logs.map(l => (
                        <div key={l.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F5F5F3', fontSize: '12px' }}>
                          <span style={{ padding: '2px 7px', borderRadius: '6px', background: l.accion==='eliminar_incidencia'?'#fef2f2':'#f0f6ff', color: l.accion==='eliminar_incidencia'?'#E24B4A':'#185FA5', fontWeight: '600', flexShrink: 0, fontSize: '10px' }}>
                            {l.accion === 'eliminar_incidencia' ? 'Eliminó' : 'Editó'}
                          </span>
                          <span style={{ flex: 1, color: '#555' }}>{l.datos?.categoria || l.datos?.descripcionAnterior?.slice(0,40)}{l.datos?.motivo ? ` · "${l.datos.motivo}"` : ''}</span>
                          <span style={{ color: '#aaa', flexShrink: 0 }}>{l.usuarioNombre}</span>
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '360px', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '28px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#111', marginBottom: '6px' }}>Iniciar turno</div>
        <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '20px' }}>¿Para qué fecha es este turno?</div>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Fecha de inicio del turno</div>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ width: '100%', fontSize: '14px', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '10px 12px' }} />
        </div>
        <div style={{ background: '#f0f6ff', border: '1px solid #b5d4f4', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#185FA5', marginBottom: '20px' }}>
          El turno puede extenderse más allá de la medianoche — las incidencias quedan bajo esta fecha.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', fontWeight: '500' }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving||!fecha} style={{ flex: 2, padding: '10px', fontSize: '13px', fontWeight: '700', borderRadius: '10px', background: '#1D9E75', color: '#fff', border: 'none', cursor: 'pointer' }}>{saving?'Iniciando...':'Iniciar turno'}</button>
        </div>
      </div>
    </>
  )
}
