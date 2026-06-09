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
  const [franjaGrafico, setFranjaGrafico] = useState(null)
  const [primerIngresoGrande, setPrimerIngresoGrande] = useState('')
  const [primerIngresoChica,  setPrimerIngresoChica]  = useState('')
  const [ultimoIngresoGrande, setUltimoIngresoGrande] = useState('')
  const [ultimoIngresoChica,  setUltimoIngresoChica]  = useState('')
  const [descGrande, setDescGrande] = useState([])
  const [descChica,  setDescChica]  = useState([])

  useEffect(() => {
    const tick = () => { const n = new Date(); setHoraActual(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`) }
    tick(); const t = setInterval(tick, 10000); return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const hoy = new Date()
    const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`
    const fechaAyer = (() => { const d = new Date(hoy); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
    const idManana = fechaStr.replace(/-/g,'') + '_manana'
    getDocs(collection(db,'turnos')).then(snap => {
      const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const turnosHoy = todos.filter(t => t.fecha === fechaStr).sort((a,b) => b.id.localeCompare(a.id))
      const turnosAyer = todos.filter(t => t.fecha === fechaAyer && t.estado === 'activo').sort((a,b) => b.id.localeCompare(a.id))
      setTurnoId((turnosHoy[0] || turnosAyer[0])?.id || idManana)
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
    getDoc(doc(db,'turnos',turnoId)).then(s => {
      if (s.exists()) {
        const d = s.data()
        if (d.primerIngresoGrande) setPrimerIngresoGrande(d.primerIngresoGrande)
        if (d.primerIngresoChica)  setPrimerIngresoChica(d.primerIngresoChica)
        if (d.ultimoIngresoGrande) setUltimoIngresoGrande(d.ultimoIngresoGrande)
        if (d.ultimoIngresoChica)  setUltimoIngresoChica(d.ultimoIngresoChica)
        if (d.descansosGrande) setDescGrande(d.descansosGrande)
        if (d.descansosChica)  setDescChica(d.descansosChica)
      }
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
    .filter(i => !franjaGrafico || i.franja === franjaGrafico)

  const franjasFiltradas = franjas.filter(f => incsFiltradas.filter(i=>i.franja===f).length > 0)

  // Para KPIs: si hay franja seleccionada, filtrar también por franja
  const incsParaKPI = activas.filter(i => !franjaGrafico || i.franja === franjaGrafico)

  const tiempoPorCategoria = incsParaKPI.reduce((acc, i) => {
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
    critico: incsParaKPI.filter(i=>i.grado==='critico').length,
    moderado: incsParaKPI.filter(i=>i.grado==='moderado').length,
    leve: incsParaKPI.filter(i=>i.grado==='leve').length,
    informativo: incsParaKPI.filter(i=>i.grado==='informativo').length
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
  const fechaDisplay = (() => { const d = new Date(); return d.toLocaleDateString('es-AR', { weekday: 'long' }).toUpperCase() + ' ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') })()
  const objG = config?.objetivoGrande || 350
  const objC = config?.objetivoChica  || 100

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#F4F4F1', minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E8E5', padding: '0 20px', height: '54px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 5, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#111', color: '#fff', borderRadius: '7px', padding: '3px 7px', lineHeight: 1 }}>
            <span style={{ fontSize: '7px', fontWeight: '600', letterSpacing: '.1em', opacity: .6, textTransform: 'uppercase' }}>SEM</span>
            <span style={{ fontSize: '16px', fontWeight: '800' }}>{semana}</span>
          </div>
          <span style={{ fontSize: '26px', fontWeight: '700', color: '#111', letterSpacing: '-1px', lineHeight: 1 }}>{horaActual}</span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#333' }}>{fechaDisplay}</span>
            {turnoExiste && <span style={{ fontSize: '9px', fontWeight: '700', color: '#1D9E75', letterSpacing: '.06em', textTransform: 'uppercase' }}>Turno activo</span>}
          </div>
        </div>
        {turnoExiste && <button onClick={() => setDrawerOpen('elegir')} title="Registrar incidencia" style={{ width: '30px', height: '30px', borderRadius: '50%', border: 'none', background: '#185FA5', color: '#fff', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0, boxShadow: '0 2px 6px rgba(24,95,165,0.3)' }}>+</button>}
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

      <div style={{ display: 'grid', gridTemplateColumns: sectoresConInc.length > 0 ? '1fr 260px' : '1fr', minHeight: 'calc(100vh - 54px)' }}>
        <div style={{ borderRight: sectoresConInc.length > 0 ? '1px solid #E8E8E5' : 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: '#E8E8E5', borderBottom: '1px solid #E8E8E5' }}>
            <div style={{ background: '#fff', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', display:'flex', alignItems:'center', gap:'6px' }}>Incidencias del turno{franjaGrafico && <span style={{fontSize:'9px',padding:'1px 6px',borderRadius:'20px',background:'#EFF5FF',color:'#185FA5',fontWeight:'700',textTransform:'none',letterSpacing:'0'}}>{franjaGrafico.replace('-',' — ')}</span>}</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#E24B4A', lineHeight: 1, marginBottom: '8px' }}>{incsFiltradas.length}{activas.length !== incsFiltradas.length && <span style={{ fontSize: '12px', color: '#bbb', fontWeight: '400', marginLeft: '6px' }}>de {activas.length}</span>}</div>
              {activas.length > 0 && <div style={{ height: '5px', borderRadius: '3px', display: 'flex', overflow: 'hidden', gap: '2px', marginBottom: '8px' }}>{['critico','moderado','leve','informativo'].map(g => gradoCount[g] > 0 && <div key={g} onClick={() => toggleGrado(g)} style={{ height: '100%', background: gradoColor[g], width: `${Math.round(gradoCount[g]/activas.length*100)}%`, borderRadius: '2px', cursor: 'pointer', opacity: gradoFiltro && gradoFiltro !== g ? 0.25 : 1 }} />)}</div>}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>{['critico','moderado','leve','informativo'].map(g => gradoCount[g] > 0 && <span key={g} onClick={() => toggleGrado(g)} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: gradoBg[g], color: gradoColor[g], fontWeight: '700', cursor: 'pointer', border: `1.5px solid ${gradoFiltro === g ? gradoColor[g] : 'transparent'}`, opacity: gradoFiltro && gradoFiltro !== g ? 0.35 : 1 }}>{gradoCount[g]} {gradoLabel[g]}{gradoCount[g] > 1 ? 's' : ''}</span>)}</div>
            </div>
            <div style={{ background: '#fff', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', display:'flex', alignItems:'center', gap:'6px' }}>Tiempo perdido{franjaGrafico && <span style={{fontSize:'9px',padding:'1px 6px',borderRadius:'20px',background:'#EFF5FF',color:'#185FA5',fontWeight:'700',textTransform:'none',letterSpacing:'0'}}>{franjaGrafico.replace('-',' — ')}</span>}</div>
              <div style={{ fontSize: '22px', fontWeight: '800', color: tiempoTotal > 0 ? '#BA7517' : '#ddd', lineHeight: 1, marginBottom: '8px' }}>{tiempoTotal > 0 ? <>{tiempoTotal}<span style={{ fontSize: '12px', fontWeight: '500', marginLeft: '3px' }}>min</span></> : '—'}</div>
              {tiempoTotal > 0 ? (<><div style={{ height: '5px', borderRadius: '3px', display: 'flex', overflow: 'hidden', gap: '2px', marginBottom: '8px' }}>{tiempoOrdenado.map(([cat,mins],idx) => <div key={cat} style={{ height:'100%', background:catColores[idx], width:`${Math.round(mins/tiempoTotal*100)}%`, borderRadius:'2px' }} />)}</div><div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>{tiempoOrdenado.map(([cat,mins],idx) => <div key={cat} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'10px', color:'#555' }}><div style={{ width:'6px', height:'6px', borderRadius:'50%', background:catColores[idx], flexShrink:0 }} /><span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat}</span><span style={{ fontWeight:'700', color:'#333' }}>{mins}m</span></div>)}</div></>) : <div style={{ fontSize: '10px', color: '#ccc' }}>Registrá hora de fin para ver el tiempo</div>}
            </div>
            <div style={{ background: '#fff', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', color: '#aaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Total producido</div>
              {(() => {
                const tG = franjaGrafico ? (produccion[franjaGrafico]?.grande||0) : Object.values(produccion).reduce((a,p)=>a+(p.grande||0),0)
                const tC = franjaGrafico ? (produccion[franjaGrafico]?.chica||0) : Object.values(produccion).reduce((a,p)=>a+(p.chica||0),0)
                const total = tG+tC
                const objTotal = franjaGrafico ? (objG+objC) : (objG+objC)*(config?generarFranjas(config):[]).length
                const pct = objTotal>0?Math.round(total/objTotal*100):0
                const delta = total-objTotal
                return total>0?(<><div style={{fontSize:'22px',fontWeight:'800',color:'#111',lineHeight:1,marginBottom:'4px'}}>{total.toLocaleString('es-AR')}</div><div style={{fontSize:'10px',color:'#bbb',marginBottom:'4px'}}>de {objTotal.toLocaleString('es-AR')} objetivo</div><div style={{display:'flex',alignItems:'center',gap:'6px'}}><span style={{fontSize:'16px',fontWeight:'800',color:pct>=100?'#1D9E75':'#E24B4A'}}>{pct}%</span><span style={{fontSize:'10px',color:pct>=100?'#1D9E75':'#E24B4A',fontWeight:'700'}}>{delta>=0?'+':''}{delta.toLocaleString('es-AR')} cuartos</span></div></>):<div style={{fontSize:'22px',fontWeight:'800',color:'#ddd',lineHeight:1}}>—</div>
              })()}
            </div>
          </div>

          {!turnoExiste && <div onClick={()=>setModalIniciarTurno(true)} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'10px',background:'#fff',borderBottom:'1px solid #E8E8E5',padding:'14px',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='#edfbf4'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}><span style={{fontSize:'18px',color:'#1D9E75'}}>▶</span><span style={{fontSize:'13px',fontWeight:'600',color:'#1D9E75'}}>Iniciar turno de hoy</span></div>}

          {turnoExiste && (
            <div style={{ borderBottom: '1px solid #E8E8E5' }}>
              <div onClick={()=>setGraficosExpandido(!graficosExpandido)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 18px',cursor:'pointer',background:'#fff',userSelect:'none'}} onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <span style={{fontSize:'10px',fontWeight:'700',color:'#999',textTransform:'uppercase',letterSpacing:'.08em'}}>Producción hora a hora</span>
                <span style={{fontSize:'10px',color:'#ccc',transform:graficosExpandido?'rotate(180deg)':'none',display:'inline-block',transition:'transform .2s'}}>▼</span>
              </div>
              {graficosExpandido && (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',background:'#fff',padding:'0 0 12px 0'}}>
                    {[
                      {label:'Sala grande',sala:'grande',obj:objG,primerIngreso:primerIngresoGrande,ultimoIngreso:ultimoIngresoGrande,descSala:descGrande},
                      {label:'Sala chica', sala:'chica', obj:objC,primerIngreso:primerIngresoChica, ultimoIngreso:ultimoIngresoChica, descSala:descChica},
                    ].map(({label,sala,obj,primerIngreso,ultimoIngreso,descSala})=>(
                      <div key={sala} style={{padding:'10px 16px'}}>
                        <GraficoHoraAHora franjas={config?generarFranjas(config):[]} produccion={produccion} objetivo={obj} config={config} sala={sala} incidencias={activas} label={label} franjaSeleccionada={franjaGrafico} onSelectFranja={f=>setFranjaGrafico(prev=>prev===f?null:f)} primerIngreso={primerIngreso} ultimoIngreso={ultimoIngreso} descSala={descSala} />
                      </div>
                    ))}
                  </div>
                  {franjaGrafico && <PanelSinSala franja={franjaGrafico} incidencias={activas} onClose={()=>setFranjaGrafico(null)} />}
                </>
              )}
            </div>
          )}

          <div>
            <div onClick={()=>setIncidenciasExpandido(!incidenciasExpandido)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 18px',cursor:'pointer',background:'#fff',borderBottom:'1px solid #E8E8E5',userSelect:'none'}} onMouseEnter={e=>e.currentTarget.style.background='#FAFAF8'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              <span style={{fontSize:'10px',fontWeight:'700',color:'#999',textTransform:'uppercase',letterSpacing:'.08em'}}>Incidencias {hayFiltros?`(${incsFiltradas.length} filtradas)`:`(${activas.length})`}</span>
              <span style={{fontSize:'10px',color:'#ccc',transform:incidenciasExpandido?'rotate(180deg)':'none',display:'inline-block',transition:'transform .2s'}}>▼</span>
            </div>
            {incidenciasExpandido && (
              <div style={{padding:'12px 18px'}}>
                {franjasFiltradas.length===0
                  ?<div style={{textAlign:'center',padding:'2.5rem',color:'#ccc',fontSize:'13px'}}>{hayFiltros?'Sin incidencias con los filtros aplicados':'Sin incidencias registradas en el turno'}</div>
                  :franjasFiltradas.map(franja=>(
                    <div key={franja} style={{marginBottom:'12px'}}>
                      <div style={{fontSize:'10px',fontWeight:'700',color:'#bbb',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:'6px'}}>{(franja||'').replace('-',' — ')}</div>
                      {incsFiltradas.filter(i=>i.franja===franja).map(inc=>(
                        <IncCard key={inc.id} inc={inc} turnoId={turnoId} userData={userData} onEditar={setEditando} onEliminar={setEliminando} defaultOpen={inc.id===ultimaIncId} />
                      ))}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>

        {sectoresConInc.length>0&&(
          <div style={{padding:'16px 14px'}}>
            <div style={{fontSize:'9px',fontWeight:'700',color:'#bbb',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:'10px'}}>Sectores · click filtra · doble click detalle</div>
            {sectoresConInc.map(s=><SectorCard key={s} sector={s} incs={activas.filter(i=>i.sectoresResponsables?.includes(s))} seleccionado={sectorFiltro===s} onClick={()=>toggleSector(s)} onDobleClick={()=>setSectorDetalle(s)} />)}
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


function getDescansoParcial(franja, config, descSala) {
  // descSala: array de {hora, min, dur} — override por sala
  // si no, usa el config global (descanso1* y descanso2*)
  if (!franja) return 0
  const hFranja = parseInt(franja.split(':')[0])
  let minDesc = 0
  const descansos = (descSala && descSala.length > 0)
    ? descSala
    : config ? [
        { hora: config.descanso1Hora, min: config.descanso1Min || 0, dur: config.descanso1Dur || 0 },
        { hora: config.descanso2Hora, min: config.descanso2Min || 0, dur: config.descanso2Dur || 0 },
      ] : []
  for (const d of descansos) {
    if (d.hora === undefined || d.hora === null || d.hora === '' || !d.dur) continue
    const dIni = Number(d.hora) * 60 + Number(d.min || 0)
    const dFin = dIni + Number(d.dur)
    const fIni = hFranja * 60
    const fFin = fIni + 60
    minDesc += Math.max(0, Math.min(dFin, fFin) - Math.max(dIni, fIni))
  }
  return minDesc
}

function GraficoHoraAHora({ franjas, produccion, objetivo, config, sala, incidencias, label, franjaSeleccionada, onSelectFranja, primerIngreso, ultimoIngreso, descSala }) {
  const [tooltipFranja, setTooltipFranja] = useState(null)
  const [tooltipPos,    setTooltipPos]    = useState({ x: 0, y: 0 })
  const AXIS_W = 28  // ancho del eje Y
  const W = 500, H = 240, PT = 20, PB = 36, PX = 4
  const n = franjas.length
  if (n === 0) return null
  const chartW = W - AXIS_W
  const slot = (chartW - PX * 2) / n
  const barW = Math.max(10, Math.floor(slot) - 4)
  const chartH = H - PT - PB
  const primeraFranja = franjas[0]
  const ultimaFranja  = franjas[franjas.length - 1]

  function objFranja(f) {
    if (f === primeraFranja && primerIngreso) return null
    if (f === ultimaFranja  && ultimoIngreso) return null
    const mDesc = getDescansoParcial(f, config, descSala)
    return Math.round(objetivo * (60 - mDesc) / 60)
  }

  const vals = franjas.map(f => produccion[f]?.[sala]).filter(v => v != null)
  const maxVal = Math.max(...franjas.map(f => objFranja(f)).filter(v => v != null), ...vals, 1) * 1.4
  const totalProd = Object.values(produccion).reduce((a, p) => a + (p[sala] || 0), 0)
  const franjasConObj = franjas.filter(f => getDescansoParcial(f, config, descSala) < 60 && objFranja(f) != null)
  const objTotal = objetivo * franjasConObj.length
  const pct = objTotal > 0 ? Math.round(totalProd / objTotal * 100) : 0
  const deltaTotal = totalProd - objTotal
  const incsFranja = franjaSeleccionada ? (incidencias||[]).filter(i=>i.franja===franjaSeleccionada&&(i.sala===sala||i.sala==='ambas')) : []

  // grid lines: 0, objetivo, y un valor intermedio
  const yZero = PT + chartH  // línea del cero (base de las barras)
  const gridVals = [0, Math.round(objetivo / 2), objetivo]
  const gridLines = gridVals.map(v => ({
    v,
    y: PT + chartH - Math.round((v / maxVal) * chartH)
  }))

  // Calcular total minutos de descanso del turno
  const totalDescMinutos = franjaSeleccionada ? getDescansoParcial(franjaSeleccionada, config, descSala) : franjas.reduce((sum, f) => sum + getDescansoParcial(f, config, descSala), 0)
  const descHoras = Math.floor(totalDescMinutos / 60)
  const descMins = totalDescMinutos % 60
  const descLabel = totalDescMinutos > 0 ? (descHoras > 0 ? `${descHoras}h ${descMins > 0 ? descMins+'m' : ''}` : `${descMins}m`) : null

  return (
    <div style={{position:'relative',border:'1px solid #E8E8E4',borderRadius:'10px',padding:'10px 12px',background:'#fff'}}>
      {/* tooltip líneas */}
      {tooltipFranja && produccion[tooltipFranja]?.lineas && sala === 'grande' && (
        <div style={{position:'absolute',left:tooltipPos.x,top:tooltipPos.y,zIndex:10,background:'#111',color:'#fff',borderRadius:'8px',padding:'8px 12px',fontSize:'11px',pointerEvents:'none',minWidth:'100px',boxShadow:'0 4px 12px rgba(0,0,0,0.25)',transform:'translateX(-50%) translateY(-110%)'}}>
          {Object.entries(produccion[tooltipFranja].lineas).filter(([,v])=>v!=null).map(([l,v])=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',gap:'12px',marginBottom:'2px'}}>
              <span style={{color:'#aaa',fontWeight:'600'}}>{l}</span>
              <span style={{fontWeight:'700'}}>{v}</span>
            </div>
          ))}
          <div style={{borderTop:'1px solid #333',marginTop:'4px',paddingTop:'4px',display:'flex',justifyContent:'space-between',gap:'12px'}}>
            <span style={{color:'#aaa',fontWeight:'600'}}>Total</span>
            <span style={{fontWeight:'800',color:'#fff'}}>{produccion[tooltipFranja].grande}</span>
          </div>
        </div>
      )}
      <div style={{display:'flex',alignItems:'baseline',gap:'12px',marginBottom:'6px'}}>
        <span style={{fontSize:'11px',fontWeight:'700',color:'#888',textTransform:'uppercase',letterSpacing:'.07em'}}>{label}</span>
        <span style={{fontSize:'20px',fontWeight:'800',color:'#111',letterSpacing:'-0.5px'}}>{totalProd.toLocaleString('es-AR')}</span>
        <span style={{fontSize:'11px',color:'#bbb'}}>de {objTotal.toLocaleString('es-AR')}</span>
        <span style={{fontSize:'13px',fontWeight:'700',color:pct>=100?'#1D9E75':'#E24B4A'}}>{pct}%</span>
        <span style={{fontSize:'11px',fontWeight:'600',color:pct>=100?'#1D9E75':'#E24B4A'}}>{deltaTotal>=0?'+':''}{deltaTotal.toLocaleString('es-AR')}</span>
        {descLabel && <span style={{marginLeft:'auto',fontSize:'10px',fontWeight:'600',color:'#B0B0A8',display:'flex',alignItems:'center',gap:'3px'}}><span style={{width:'8px',height:'8px',borderRadius:'2px',background:'#B0B0A8',display:'inline-block',opacity:.75}}/> {descLabel} desc.</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'auto',display:'block',cursor:'pointer'}}>
        {/* eje Y + grid */}
        {gridLines.map(({v, y}) => (
          <g key={v}>
            {/* línea de grid */}
            <line x1={AXIS_W} y1={y} x2={W} y2={y}
              stroke={v === 0 ? '#BBBBB5' : '#EBEBЕ8'}
              strokeWidth={v === 0 ? 1.2 : 0.8}
              strokeDasharray={v === 0 ? 'none' : '3 3'} />
            {/* label eje Y */}
            <text x={AXIS_W - 4} y={y + 4} textAnchor="end"
              fontSize="9" fill={v === 0 ? '#999' : '#C0C0BC'} fontFamily="system-ui" fontWeight={v === 0 ? '600' : '400'}>
              {v}
            </text>
          </g>
        ))}
        {/* línea vertical del eje Y */}
        <line x1={AXIS_W} y1={PT} x2={AXIS_W} y2={PT+chartH} stroke="#E8E8E4" strokeWidth="1" />

        {/* barras */}
        {franjas.map((franja,i)=>{
          const x = AXIS_W + PX + i * slot
          const xc = x + slot / 2
          const mDesc = getDescansoParcial(franja, config, descSala)
          const objF = objFranja(franja)
          const yObj = objF != null ? PT + chartH - Math.round((objF / maxVal) * chartH) : null
          const val = produccion[franja]?.[sala]
          const hora = (franja||'').split(':')[0].replace(/^0/,'')
          const sel = franjaSeleccionada === franja
          const tieneIncs = (incidencias||[]).some(i=>i.franja===franja&&(i.sala===sala||i.sala==='ambas'))
          const lineEl = yObj != null ? <line key={`l${i}`} x1={x} y1={yObj} x2={x+barW+2} y2={yObj} stroke="#C8B89A" strokeWidth="1.2" strokeDasharray="4 2"/> : null
          const bgEl = sel ? <rect key={`bg${i}`} x={x-2} y={PT} width={slot} height={chartH} fill="#EFF5FF" rx="2"/> : null
          if (val == null) return (
            <g key={franja} onClick={()=>onSelectFranja&&onSelectFranja(franja)}>
              {bgEl}{lineEl}
              <text x={xc} y={H-PB+14} textAnchor="middle" fontSize="10" fontWeight="600" fill={sel?'#185FA5':'#CCC'} fontFamily="system-ui">{hora}</text>
              {tieneIncs && <circle cx={xc} cy={H-PB+26} r="2.5" fill="#E24B4A"/>}
            </g>
          )
          const sobre = objF != null ? val >= objF : null
          const color = sobre === true ? '#1D9E75' : sobre === false ? '#E24B4A' : '#888'
          const bH = Math.max(4, Math.round((val / maxVal) * chartH))
          const delta = objF != null ? val - objF : null
          const overlayH = Math.round(bH * (mDesc / 60))
          return (
            <g key={franja} onClick={()=>onSelectFranja&&onSelectFranja(franja)} style={{cursor:'pointer'}}
              onMouseEnter={() => { if(sala==='grande' && produccion[franja]?.lineas){ setTooltipFranja(franja); setTooltipPos({x:`${Math.round((xc/W)*100)}%`, y: PT+chartH-bH-10}) } }}
              onMouseLeave={()=>setTooltipFranja(null)}>
              {bgEl}{lineEl}
              <rect x={x+1} y={yZero-bH} width={barW} height={bH} fill={color} rx="3" opacity={sel?1:.85}/>
              {sel && <rect x={x+1} y={yZero-bH} width={barW} height={bH} fill="none" stroke={color} strokeWidth="2" rx="3"/>}
              {mDesc > 0 && overlayH > 0 && <rect x={x+1} y={yZero-bH} width={barW} height={overlayH} fill="#B0B0A8" rx="3" opacity=".75"/>}
              <text x={xc} y={yZero-bH-5} textAnchor="middle" fontSize="10" fill={color} fontWeight="700" fontFamily="system-ui">{val}</text>
              <text x={xc} y={H-PB+14} textAnchor="middle" fontSize="10" fontWeight="700" fill={sel?'#185FA5':'#555'} fontFamily="system-ui">{hora}</text>
              {delta != null && <text x={xc} y={H-PB+25} textAnchor="middle" fontSize="8.5" fill={sobre?'#1D9E75':'#E24B4A'} fontWeight="700" fontFamily="system-ui">{delta>=0?`+${delta}`:delta}</text>}
            </g>
          )
        })}
      </svg>
      {franjaSeleccionada&&(
        <div style={{background:'#F8FBFF',border:'1.5px solid #C8DCF5',borderRadius:'10px',padding:'10px 14px',marginTop:'4px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px'}}>
            <span style={{fontSize:'11px',fontWeight:'700',color:'#185FA5',textTransform:'uppercase',letterSpacing:'.06em'}}>{(franjaSeleccionada||'').replace('-',' — ')}</span>
            <span onClick={()=>onSelectFranja&&onSelectFranja(franjaSeleccionada)} style={{fontSize:'11px',color:'#aaa',cursor:'pointer'}}>×</span>
          </div>
          {incsFranja.length===0
            ?<div style={{fontSize:'12px',color:'#bbb',padding:'4px 0'}}>Sin incidencias en esta franja para {label.toLowerCase()}</div>
            :incsFranja.map(inc=>{
                const [h1,m1]=(inc.horaInicio||'0:0').split(':').map(Number)
                const [h2,m2]=(inc.horaFin||'0:0').split(':').map(Number)
                const dur=inc.horaFin?Math.max(0,(h2*60+m2)-(h1*60+m1)):null
                return(
                  <div key={inc.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 0',borderBottom:'1px solid #E8F0FB'}}>
                    <div style={{width:'7px',height:'7px',borderRadius:'50%',background:gradoColor[inc.grado],flexShrink:0}}/>
                    <span style={{fontSize:'11px',color:'#888',minWidth:'38px'}}>{inc.horaInicio}</span>
                    <span style={{fontSize:'12px',fontWeight:'600',color:'#222',flex:1}}>{inc.categoriaNombre}</span>
                    <span style={{fontSize:'10px',padding:'2px 7px',borderRadius:'20px',background:gradoBg[inc.grado],color:gradoColor[inc.grado],fontWeight:'700'}}>{inc.grado}</span>
                    {dur!==null&&dur>0&&<span style={{fontSize:'11px',color:'#aaa'}}>{dur}m</span>}
                  </div>
                )
              })
          }
        </div>
      )}
    </div>
  )
}

function PanelSinSala({ franja, incidencias, onClose }) {
  const incs = incidencias.filter(i=>i.franja===franja&&(!i.sala||i.sala===''))
  return (
    <div style={{margin:'0 16px 12px',background:'#FFFBF0',border:'1.5px solid #F5E6B0',borderRadius:'10px',padding:'10px 14px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px'}}>
        <span style={{fontSize:'11px',fontWeight:'700',color:'#BA7517',textTransform:'uppercase',letterSpacing:'.06em'}}>Sin sala · {(franja||'').replace('-',' — ')}</span>
        <span onClick={onClose} style={{fontSize:'11px',color:'#aaa',cursor:'pointer'}}>×</span>
      </div>
      {incs.length===0?<div style={{fontSize:'12px',color:'#bbb'}}>Sin incidencias sin sala en esta franja</div>
        :incs.map(inc=>{
          const [h1,m1]=(inc.horaInicio||'0:0').split(':').map(Number)
          const [h2,m2]=(inc.horaFin||'0:0').split(':').map(Number)
          const dur=inc.horaFin?Math.max(0,(h2*60+m2)-(h1*60+m1)):null
          return(
            <div key={inc.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 0',borderBottom:'1px solid #F5E6B0'}}>
              <div style={{width:'7px',height:'7px',borderRadius:'50%',background:gradoColor[inc.grado],flexShrink:0}}/>
              <span style={{fontSize:'11px',color:'#888',minWidth:'38px'}}>{inc.horaInicio}</span>
              <span style={{fontSize:'12px',fontWeight:'600',color:'#222',flex:1}}>{inc.categoriaNombre}</span>
              <span style={{fontSize:'10px',padding:'2px 7px',borderRadius:'20px',background:gradoBg[inc.grado],color:gradoColor[inc.grado],fontWeight:'700'}}>{inc.grado}</span>
              {dur!==null&&dur>0&&<span style={{fontSize:'11px',color:'#aaa'}}>{dur}m</span>}
            </div>
          )
        })
      }
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
  const [descripcion, setDescripcion] = useState(inc.descripcion || '')
  const [categoria, setCategoria] = useState(inc.categoriaId)
  const [categoriaNombre, setCategoriaNombre] = useState(inc.categoriaNombre)
  const [responsables, setResponsables] = useState(inc.sectoresResponsables || [])
  const [afectados, setAfectados] = useState(inc.sectoresAfectados || [])
  const [causaExterna, setCausaExterna] = useState(inc.causaExterna || false)
  const [sala, setSala] = useState(inc.sala || '')
  const [lineas, setLineas] = useState(inc.lineas || [])
  const [horaInicio, setHoraInicio] = useState(inc.horaInicio || '')
  const [horaFin, setHoraFin] = useState(inc.horaFin || '')
  const [franja, setFranja] = useState(inc.franja || '')
  const [etiquetas, setEtiquetas] = useState(inc.etiquetas || [])
  const [tagInput, setTagInput] = useState('')
  const [busqResp, setBusqResp] = useState('')
  const [busqAfect, setBusqAfect] = useState('')
  const [busqCat, setBusqCat] = useState('')
  const [catOpen, setCatOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const lineasOpts = sala === 'chica' ? ['L5'] : ['L2','L3','L4']
  const catsFiltradas = categorias.filter(c => c.nombre.toLowerCase().includes(busqCat.toLowerCase()))
  function toggleLinea(l) { setLineas(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l]) }
  function addTag() { if (!tagInput.trim()) return; setEtiquetas(p => [...p, tagInput.trim()]); setTagInput('') }
  function BuscadorSector({ seleccionados, setSeleccionados, busq, setBusq, placeholder }) {
    const filtrados = busq.length > 0 ? sectores.filter(s => s.toLowerCase().includes(busq.toLowerCase())) : []
    return (
      <div>
        <div style={{position:'relative'}}>
          <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder={placeholder} style={{width:'100%',fontSize:'12px',padding:'8px 12px',borderRadius:'9px',border:'1.5px solid #e8e8e8',background:'#fafafa',boxSizing:'border-box'}}/>
          {busq&&<span onClick={()=>setBusq('')} style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',cursor:'pointer',color:'#bbb'}}>×</span>}
        </div>
        {busq.length>0&&filtrados.length>0&&<div style={{border:'1.5px solid #185FA5',borderRadius:'9px',overflow:'hidden',marginTop:'4px',maxHeight:'150px',overflowY:'auto',background:'#fff',boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>{filtrados.map(s=><div key={s} onClick={()=>{setSeleccionados(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]);setBusq('')}} style={{padding:'8px 12px',fontSize:'12px',cursor:'pointer',background:seleccionados.includes(s)?'#f0f6ff':'#fff',borderBottom:'1px solid #f5f5f5',color:seleccionados.includes(s)?'#185FA5':'#333',fontWeight:seleccionados.includes(s)?'600':'400'}}>{seleccionados.includes(s)?'✓ ':''}{s}</div>)}</div>}
        {seleccionados.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:'5px',marginTop:'6px'}}>{seleccionados.map(r=><span key={r} style={{fontSize:'11px',padding:'3px 8px 3px 10px',borderRadius:'20px',background:'#f0f6ff',color:'#185FA5',border:'1px solid #b5d4f4',display:'flex',alignItems:'center',gap:'4px'}}>{r} <span onClick={()=>setSeleccionados(p=>p.filter(x=>x!==r))} style={{cursor:'pointer',opacity:.6}}>×</span></span>)}</div>}
      </div>
    )
  }
  async function guardar() {
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id),{grado,descripcion,categoriaId:categoria,categoriaNombre,sectoresResponsables:responsables,sectoresAfectados:afectados,causaExterna,sala,lineas,horaInicio,horaFin:horaFin||null,franja,etiquetas,editadoPor:userData.nombre,editadoEn:serverTimestamp()})
    await addDoc(collection(db,'log'),{accion:'editar_incidencia',turnoId,recursoId:inc.id,usuarioNombre:userData.nombre,datos:{gradoAnterior:inc.grado,descripcionAnterior:inc.descripcion},timestamp:serverTimestamp()})
    setSaving(false); onClose()
  }
  const lbl=(t,opt)=><div style={{fontSize:'11px',fontWeight:'600',color:'#666',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'7px'}}>{t}{opt&&<span style={{fontSize:'10px',color:'#bbb',fontWeight:'400',marginLeft:'5px',textTransform:'none'}}>opcional</span>}</div>
  return (
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:20}}/>
      <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'680px',maxHeight:'92vh',overflowY:'auto',background:'#fff',borderRadius:'18px',zIndex:21,fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',boxShadow:'0 20px 60px rgba(0,0,0,0.18)'}}>
        <div style={{padding:'22px 28px 18px',borderBottom:'1px solid #F0F0EE',position:'sticky',top:0,background:'#fff',zIndex:2,borderRadius:'18px 18px 0 0'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div><div style={{fontSize:'17px',fontWeight:'700',color:'#111'}}>Editar incidencia</div><div style={{fontSize:'11px',color:'#aaa',marginTop:'2px'}}>{inc.horaInicio} · {(inc.franja||'').replace('-',' — ')}</div></div>
            <button onClick={onClose} style={{width:'32px',height:'32px',borderRadius:'8px',border:'1px solid #e8e8e8',background:'#fafafa',cursor:'pointer',fontSize:'18px',color:'#888'}}>×</button>
          </div>
        </div>
        <div style={{padding:'22px 28px 28px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'20px'}}>
            <div>
              {lbl('Categoría')}
              <div style={{position:'relative'}}>
                <div onClick={()=>setCatOpen(!catOpen)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',borderRadius:'10px',border:`1.5px solid ${catOpen?'#185FA5':'#e8e8e8'}`,background:'#fff',cursor:'pointer',fontSize:'13px',color:categoriaNombre?'#111':'#bbb'}}>
                  <span>{categoriaNombre||'Seleccioná...'}</span>
                  <span style={{fontSize:'9px',color:'#bbb',transform:catOpen?'rotate(180deg)':'none',display:'inline-block'}}>▼</span>
                </div>
                {catOpen&&<div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:10,background:'#fff',border:'1.5px solid #185FA5',borderRadius:'10px',marginTop:'4px',boxShadow:'0 8px 24px rgba(0,0,0,0.12)',overflow:'hidden'}}>
                  <div style={{padding:'8px'}}><input autoFocus value={busqCat} onChange={e=>setBusqCat(e.target.value)} placeholder="Buscar..." style={{width:'100%',fontSize:'12px',borderRadius:'7px',border:'1px solid #e8e8e8',padding:'6px 10px',boxSizing:'border-box'}}/></div>
                  <div style={{maxHeight:'180px',overflowY:'auto'}}>{catsFiltradas.map(c=><div key={c.id} onClick={()=>{setCategoria(c.id);setCategoriaNombre(c.nombre);setCatOpen(false);setBusqCat('')}} style={{padding:'8px 14px',fontSize:'13px',cursor:'pointer',background:categoria===c.id?'#f0f6ff':'#fff',color:categoria===c.id?'#185FA5':'#333',fontWeight:categoria===c.id?'600':'400',borderBottom:'1px solid #f5f5f5',display:'flex',justifyContent:'space-between'}}>{c.nombre}{categoria===c.id&&<span>✓</span>}</div>)}</div>
                </div>}
              </div>
            </div>
            <div>
              {lbl('Grado')}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}}>{Object.entries(gradoColor).map(([g,c])=><button key={g} onClick={()=>setGrado(g)} style={{padding:'7px 8px',fontSize:'12px',fontWeight:grado===g?'700':'400',borderRadius:'8px',border:`1.5px solid ${grado===g?c:'#e8e8e8'}`,background:grado===g?c+'18':'#fafafa',color:grado===g?c:'#888',cursor:'pointer',textTransform:'capitalize'}}>{g}</button>)}</div>
            </div>
          </div>
          <div style={{marginBottom:'20px'}}>
            {lbl('Descripción')}
            <textarea value={descripcion} onChange={e=>setDescripcion(e.target.value)} style={{width:'100%',fontSize:'13px',minHeight:'70px',resize:'vertical',borderRadius:'10px',border:'1.5px solid #e8e8e8',padding:'9px 12px',fontFamily:'inherit',lineHeight:'1.5',boxSizing:'border-box'}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'20px'}}>
            <div>
              {lbl('Sala',true)}
              <div style={{display:'flex',gap:'6px',marginBottom:'10px'}}>{['grande','chica','ambas'].map(s=><button key={s} onClick={()=>{setSala(sala===s?'':s);setLineas([])}} style={{flex:1,padding:'7px 4px',fontSize:'11px',fontWeight:sala===s?'700':'400',borderRadius:'8px',border:`1.5px solid ${sala===s?'#185FA5':'#e8e8e8'}`,background:sala===s?'#185FA5':'#fafafa',color:sala===s?'#fff':'#666',cursor:'pointer'}}>{s==='grande'?'Grande':s==='chica'?'Chica':'Ambas'}</button>)}</div>
              {sala&&<><div style={{fontSize:'11px',fontWeight:'600',color:'#666',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'7px'}}>Líneas <span style={{fontSize:'10px',color:'#bbb',fontWeight:'400',textTransform:'none'}}>opcional</span></div><div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>{lineasOpts.map(l=><button key={l} onClick={()=>toggleLinea(l)} style={{padding:'5px 14px',fontSize:'12px',borderRadius:'20px',border:`1.5px solid ${lineas.includes(l)?'#BA7517':'#e8e8e8'}`,background:lineas.includes(l)?'#fff8ee':'#fafafa',color:lineas.includes(l)?'#BA7517':'#888',cursor:'pointer'}}>{l}</button>)}</div></>}
            </div>
            <div>
              {lbl('Horario')}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'10px'}}>
                <div><div style={{fontSize:'10px',color:'#999',marginBottom:'4px'}}>Inicio</div><input type="time" value={horaInicio} onChange={e=>setHoraInicio(e.target.value)} style={{width:'100%',fontSize:'13px',borderRadius:'9px',border:'1.5px solid #e8e8e8',padding:'7px 10px',boxSizing:'border-box'}}/></div>
                <div><div style={{fontSize:'10px',color:'#999',marginBottom:'4px'}}>Fin <span style={{color:'#bbb'}}>opcional</span></div><input type="time" value={horaFin} onChange={e=>setHoraFin(e.target.value)} style={{width:'100%',fontSize:'13px',borderRadius:'9px',border:'1.5px solid #e8e8e8',padding:'7px 10px',boxSizing:'border-box'}}/></div>
              </div>
              {lbl('Franja',true)}
              <select value={franja} onChange={e=>setFranja(e.target.value)} style={{width:'100%',fontSize:'12px',borderRadius:'9px',border:'1.5px solid #e8e8e8',padding:'8px 10px',background:'#fafafa',color:'#333'}}>
                {Array.from({length:10},(_,i)=>{const h=String(i+4).padStart(2,'0');const h2=String(i+5).padStart(2,'0');const f=`${h}:00-${h2}:00`;return<option key={f} value={f}>{h}:00 — {h2}:00</option>})}
              </select>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px',marginBottom:'20px'}}>
            <div>{lbl('Sectores responsables',true)}<BuscadorSector seleccionados={responsables} setSeleccionados={setResponsables} busq={busqResp} setBusq={setBusqResp} placeholder="Buscá un sector..."/><button onClick={()=>setCausaExterna(!causaExterna)} style={{marginTop:'8px',fontSize:'11px',padding:'4px 12px',borderRadius:'20px',border:`1.5px ${causaExterna?'solid':'dashed'} ${causaExterna?'#185FA5':'#ddd'}`,background:causaExterna?'#f0f6ff':'#fff',color:causaExterna?'#185FA5':'#aaa',cursor:'pointer'}}>🌐 Causa externa</button></div>
            <div>{lbl('Sectores afectados',true)}<BuscadorSector seleccionados={afectados} setSeleccionados={setAfectados} busq={busqAfect} setBusq={setBusqAfect} placeholder="Buscá un sector..."/></div>
          </div>
          <div style={{marginBottom:'24px'}}>
            {lbl('Etiquetas',true)}
            <div style={{display:'flex',gap:'8px',marginBottom:'6px'}}><input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTag()} placeholder="Escribí y Enter..." style={{flex:1,fontSize:'12px',borderRadius:'9px',border:'1.5px solid #e8e8e8',padding:'7px 10px'}}/><button onClick={addTag} style={{fontSize:'11px',padding:'7px 12px',borderRadius:'9px',border:'1.5px solid #e8e8e8',background:'#fafafa',cursor:'pointer',color:'#555'}}>+ Add</button></div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'5px'}}>{etiquetas.map((t,i)=><span key={i} style={{fontSize:'11px',padding:'3px 8px 3px 10px',borderRadius:'20px',background:'#f5f5f5',border:'1px solid #e8e8e8',display:'flex',alignItems:'center',gap:'4px',color:'#555'}}>{t} <span onClick={()=>setEtiquetas(p=>p.filter((_,j)=>j!==i))} style={{cursor:'pointer',opacity:.5}}>×</span></span>)}</div>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={onClose} style={{flex:1,padding:'11px',fontSize:'13px',borderRadius:'10px',border:'1.5px solid #e8e8e8',background:'#fff',cursor:'pointer',color:'#888',fontWeight:'500'}}>Cancelar</button>
            <button onClick={guardar} disabled={saving} style={{flex:2,padding:'11px',fontSize:'13px',fontWeight:'700',borderRadius:'10px',background:'#185FA5',color:'#fff',border:'none',cursor:'pointer'}}>{saving?'Guardando...':'Guardar cambios'}</button>
          </div>
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
