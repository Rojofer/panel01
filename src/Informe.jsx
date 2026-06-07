import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'

const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
const gradoBg = { critico: '#fef2f2', moderado: '#fff8ee', leve: '#f0f6ff', informativo: '#edfbf4' }

export default function Informe({ onVolver }) {
  const [turnos, setTurnos] = useState([])
  const [turnoSeleccionado, setTurnoSeleccionado] = useState('')
  const [turnoData, setTurnoData] = useState(null)
  const [incidencias, setIncidencias] = useState([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    getDocs(collection(db,'turnos')).then(snap => {
      const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => b.id.localeCompare(a.id))
      setTurnos(lista)
      if (lista.length > 0) setTurnoSeleccionado(lista[0].id)
    })
  }, [])

  useEffect(() => {
    if (!turnoSeleccionado) return
    setCargando(true)
    Promise.all([
      getDoc(doc(db,'turnos',turnoSeleccionado)),
      getDocs(query(collection(db,'turnos',turnoSeleccionado,'incidencias'), orderBy('horaInicio','asc')))
    ]).then(([turnoSnap, incSnap]) => {
      setTurnoData(turnoSnap.exists() ? turnoSnap.data() : null)
      setIncidencias(incSnap.docs.map(d=>({id:d.id,...d.data()})).filter(i=>!i.eliminado))
      setCargando(false)
    })
  }, [turnoSeleccionado])

  const criticas = incidencias.filter(i=>i.grado==='critico')
  const moderadas = incidencias.filter(i=>i.grado==='moderado')
  const tiempoTotal = incidencias.reduce((acc,i) => {
    if (i.horaInicio && i.horaFin) {
      const [h1,m1]=i.horaInicio.split(':').map(Number)
      const [h2,m2]=i.horaFin.split(':').map(Number)
      return acc + Math.max(0,(h2*60+m2)-(h1*60+m1))
    }
    return acc
  }, 0)

  const tiempoPorCat = incidencias.reduce((acc,i) => {
    if (i.horaInicio && i.horaFin && i.categoriaNombre) {
      const [h1,m1]=i.horaInicio.split(':').map(Number)
      const [h2,m2]=i.horaFin.split(':').map(Number)
      const mins = Math.max(0,(h2*60+m2)-(h1*60+m1))
      acc[i.categoriaNombre]=(acc[i.categoriaNombre]||0)+mins
    }
    return acc
  }, {})
  const catColores = ['#BA7517','#E24B4A','#185FA5','#1D9E75','#888780']
  const tiempoOrdenado = Object.entries(tiempoPorCat).sort((a,b)=>b[1]-a[1])

  const sinNotaReunion = incidencias.filter(i=>!i.notaReunion)

  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', background:'#F7F7F5', minHeight:'100vh' }}>
      <div style={{ background:'#fff', borderBottom:'1px solid #EFEFED', padding:'12px 32px', display:'flex', alignItems:'center', gap:'12px', position:'sticky', top:0, zIndex:5 }}>
        <button onClick={onVolver} style={{ fontSize:'13px', padding:'6px 12px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#555', fontWeight:'500' }}>← Volver</button>
        <span style={{ fontSize:'16px', fontWeight:'700', color:'#111' }}>Informe gerencial</span>
        <select value={turnoSeleccionado} onChange={e=>setTurnoSeleccionado(e.target.value)}
          style={{ fontSize:'13px', padding:'6px 12px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#333' }}>
          {turnos.map(t=><option key={t.id} value={t.id}>{t.fecha} · {t.nombre}</option>)}
        </select>
        <button onClick={() => window.print()} style={{ marginLeft:'auto', fontSize:'13px', padding:'6px 14px', borderRadius:'8px', border:'1px solid #185FA5', background:'#f0f6ff', cursor:'pointer', color:'#185FA5', fontWeight:'600' }}>🖨 Imprimir / PDF</button>
      </div>

      {cargando && <div style={{ textAlign:'center', padding:'4rem', color:'#aaa' }}>Cargando...</div>}

      {!cargando && turnoData && (
        <div style={{ maxWidth:'900px', margin:'0 auto', padding:'24px 32px' }}>

          <div style={{ marginBottom:'24px' }}>
            <div style={{ fontSize:'22px', fontWeight:'700', color:'#111', marginBottom:'4px' }}>
              Turno del {turnoData.fecha}
            </div>
            <div style={{ fontSize:'14px', color:'#aaa' }}>{turnoData.inicio} — {turnoData.fin} · Estado: {turnoData.estado}</div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'24px' }}>
            {[
              ['Total incidencias', incidencias.length, '#E24B4A'],
              ['Críticas', criticas.length, '#E24B4A'],
              ['Moderadas', moderadas.length, '#BA7517'],
              ['Tiempo perdido', tiempoTotal > 0 ? tiempoTotal+' min' : '—', '#BA7517'],
            ].map(([l,v,c])=>(
              <div key={l} style={{ background:'#fff', borderRadius:'12px', padding:'14px 16px', border:'1px solid #EFEFED' }}>
                <div style={{ fontSize:'11px', color:'#aaa', marginBottom:'4px', fontWeight:'500' }}>{l}</div>
                <div style={{ fontSize:'24px', fontWeight:'700', color:c, lineHeight:1 }}>{v}</div>
              </div>
            ))}
          </div>

          {tiempoTotal > 0 && (
            <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #EFEFED', padding:'18px 20px', marginBottom:'20px' }}>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#555', marginBottom:'12px' }}>Tiempo perdido por categoría</div>
              <div style={{ height:'10px', borderRadius:'5px', display:'flex', overflow:'hidden', gap:'2px', marginBottom:'12px' }}>
                {tiempoOrdenado.map(([cat,mins],idx)=>(
                  <div key={cat} style={{ height:'100%', background:catColores[idx]||'#888', width:`${Math.round(mins/tiempoTotal*100)}%`, borderRadius:'2px' }} title={`${cat}: ${mins} min`} />
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                {tiempoOrdenado.map(([cat,mins],idx)=>(
                  <div key={cat} style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', color:'#555' }}>
                    <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:catColores[idx]||'#888', flexShrink:0 }} />
                    <span style={{ flex:1 }}>{cat}</span>
                    <span style={{ fontWeight:'600', color:'#333' }}>{mins} min</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sinNotaReunion.length > 0 && (
            <div style={{ background:'#fff8ee', border:'1px solid #F5E6B0', borderRadius:'12px', padding:'14px 18px', marginBottom:'20px' }}>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#7A6000', marginBottom:'4px' }}>⚠ Sin nota de reunión</div>
              <div style={{ fontSize:'12px', color:'#BA7517' }}>{sinNotaReunion.length} incidencia{sinNotaReunion.length>1?'s':''} sin respuesta registrada: {sinNotaReunion.map(i=>i.categoriaNombre).join(', ')}</div>
            </div>
          )}

          <div style={{ background:'#fff', borderRadius:'14px', border:'1px solid #EFEFED', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #EFEFED', fontSize:'13px', fontWeight:'600', color:'#555' }}>
              Detalle de incidencias ({incidencias.length})
            </div>
            {incidencias.length === 0 && <div style={{ textAlign:'center', padding:'3rem', color:'#ccc', fontSize:'14px' }}>Sin incidencias en este turno</div>}
            {incidencias.map((inc,idx)=>(
              <div key={inc.id} style={{ padding:'16px 20px', borderBottom: idx < incidencias.length-1 ? '1px solid #F5F5F3' : 'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                  <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:gradoColor[inc.grado], flexShrink:0 }} />
                  <span style={{ fontSize:'12px', color:'#aaa', minWidth:'38px' }}>{inc.horaInicio}{inc.horaFin ? ' – '+inc.horaFin : ''}</span>
                  <span style={{ fontSize:'13px', fontWeight:'600', color:'#111', flex:1 }}>{inc.categoriaNombre}</span>
                  <span style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'20px', background:gradoBg[inc.grado], color:gradoColor[inc.grado], fontWeight:'600' }}>{inc.grado}</span>
                </div>
                <div style={{ paddingLeft:'20px' }}>
                  {inc.sala && <span style={{ fontSize:'11px', color:'#aaa', marginRight:'12px' }}>{inc.sala === 'grande' ? 'Sala grande' : inc.sala === 'chica' ? 'Sala chica' : 'Ambas salas'}{inc.lineas?.length>0?' · '+inc.lineas.join(' '):''}</span>}
                  {inc.sectoresResponsables?.length>0 && <span style={{ fontSize:'11px', color:'#aaa', marginRight:'12px' }}>Responsable: {inc.sectoresResponsables.join(', ')}</span>}
                  <div style={{ fontSize:'13px', color:'#555', marginTop:'6px', lineHeight:'1.5' }}>{inc.descripcion}</div>
                  {inc.notaReunion
                    ? <div style={{ background:'#FFFBF0', border:'1px solid #F5E6B0', borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'#7A6000', fontStyle:'italic', lineHeight:'1.5', marginTop:'8px' }}>📝 {inc.notaReunion}</div>
                    : <div style={{ border:'1px dashed #e8e8e8', borderRadius:'8px', padding:'7px 12px', fontSize:'12px', color:'#ccc', marginTop:'8px' }}>Sin nota de reunión</div>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
