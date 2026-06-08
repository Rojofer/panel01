import { useState, useEffect } from 'react'
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from './firebase'

const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
const gradoBg   = { critico: '#fef2f2', moderado: '#fff8ee', leve: '#f0f6ff', informativo: '#edfbf4' }
const CAT_COLORES = ['#BA7517','#E24B4A','#185FA5','#1D9E75','#888780','#9B59B6','#E67E22','#2ECC71']

// ─── helpers ────────────────────────────────────────────────────────────────

function generarFranjas(config) {
  const franjas = []
  const hIni = parseInt(config.inicio)
  const hFin = parseInt(config.fin)
  for (let h = hIni; h < hFin; h++) {
    franjas.push(`${String(h).padStart(2,'0')}:00-${String(h+1).padStart(2,'0')}:00`)
  }
  return franjas
}

function minutos(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return 0
  const [h1,m1] = horaInicio.split(':').map(Number)
  const [h2,m2] = horaFin.split(':').map(Number)
  return Math.max(0, (h2*60+m2) - (h1*60+m1))
}

function esDescanso(franja, config) {
  if (!config) return false
  const hFranja = parseInt(franja.split(':')[0])
  const d1h = config.descanso1Hora, d1m = config.descanso1Min || 0
  const d2h = config.descanso2Hora, d2m = config.descanso2Min || 0
  if (d1h !== undefined && hFranja === d1h) return true
  if (d2h !== undefined && hFranja === d2h) return true
  return false
}

function formatFranja(franja) {
  return franja.split('-')[0].replace(':00','').replace(/^0/,'')
}

// ─── gráfico SVG hora a hora ─────────────────────────────────────────────────

function GraficoHoraAHora({ franjas, produccion, objetivo, config, sala }) {
  const W = 480, H = 130, PADDING_TOP = 28, PADDING_BOT = 36, PADDING_X = 10
  const nFranjas = franjas.length
  if (nFranjas === 0) return null

  const barW = Math.floor((W - PADDING_X * 2) / nFranjas) - 3
  const maxVal = Math.max(objetivo * 1.4, ...franjas.map(f => produccion[f]?.[sala] || 0))
  const chartH = H - PADDING_TOP - PADDING_BOT

  function yBar(val) {
    return PADDING_TOP + chartH - Math.round((val / maxVal) * chartH)
  }
  const yObj = yBar(objetivo)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', display:'block' }}>
      {/* línea punteada objetivo */}
      <line x1={PADDING_X} y1={yObj} x2={W - PADDING_X} y2={yObj}
        stroke="#C8B89A" strokeWidth="1.2" strokeDasharray="4 3" />

      {franjas.map((franja, i) => {
        const x = PADDING_X + i * ((W - PADDING_X*2) / nFranjas)
        const xCenter = x + barW / 2
        const desc = esDescanso(franja, config)
        const val = produccion[franja]?.[sala]
        const tieneVal = val !== null && val !== undefined

        if (desc) {
          // barra de descanso
          const barH = chartH * 0.3
          return (
            <g key={franja}>
              <rect x={x+1} y={PADDING_TOP + chartH - barH} width={barW} height={barH}
                fill="#DEDED8" rx="3" opacity="0.7" />
              <text x={xCenter} y={H - PADDING_BOT + 14} textAnchor="middle"
                fontSize="9" fill="#BCBCB0" fontFamily="system-ui">
                {formatFranja(franja)}
              </text>
              <text x={xCenter} y={H - PADDING_BOT + 24} textAnchor="middle"
                fontSize="8" fill="#BCBCB0" fontFamily="system-ui">desc.</text>
            </g>
          )
        }

        if (!tieneVal) {
          return (
            <g key={franja}>
              <text x={xCenter} y={H - PADDING_BOT + 14} textAnchor="middle"
                fontSize="9" fill="#D0D0CC" fontFamily="system-ui">
                {formatFranja(franja)}
              </text>
              <text x={xCenter} y={PADDING_TOP - 6} textAnchor="middle"
                fontSize="9" fill="#D0D0CC" fontFamily="system-ui">—</text>
            </g>
          )
        }

        const sobreObj = val >= objetivo
        const color = sobreObj ? '#1D9E75' : '#E24B4A'
        const barH = Math.max(4, Math.round((val / maxVal) * chartH))
        const delta = val - objetivo
        const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`

        return (
          <g key={franja}>
            <rect x={x+1} y={PADDING_TOP + chartH - barH} width={barW} height={barH}
              fill={color} rx="3" opacity="0.85" />
            {/* número arriba */}
            <text x={xCenter} y={PADDING_TOP + chartH - barH - 5} textAnchor="middle"
              fontSize="9" fill={color} fontWeight="600" fontFamily="system-ui">{val}</text>
            {/* hora abajo */}
            <text x={xCenter} y={H - PADDING_BOT + 14} textAnchor="middle"
              fontSize="9" fill="#888" fontFamily="system-ui">
              {formatFranja(franja)}
            </text>
            {/* delta */}
            <text x={xCenter} y={H - PADDING_BOT + 24} textAnchor="middle"
              fontSize="8" fill={sobreObj ? '#1D9E75' : '#E24B4A'} fontWeight="600" fontFamily="system-ui">
              {deltaStr}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── componente principal ────────────────────────────────────────────────────

export default function Informe({ onVolver }) {
  const [turnos, setTurnos] = useState([])
  const [turnoSeleccionado, setTurnoSeleccionado] = useState('')
  const [turnoData, setTurnoData] = useState(null)
  const [incidencias, setIncidencias] = useState([])
  const [produccion, setProduccion] = useState({})
  const [configTurno, setConfigTurno] = useState(null)
  const [cargando, setCargando] = useState(false)

  // cargar lista de turnos + config
  useEffect(() => {
    getDocs(collection(db,'turnos')).then(snap => {
      const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => b.id.localeCompare(a.id))
      setTurnos(lista)
      if (lista.length > 0) setTurnoSeleccionado(lista[0].id)
    })
    getDoc(doc(db,'config','turno')).then(s => s.exists() && setConfigTurno(s.data()))
  }, [])

  // cargar datos del turno seleccionado
  useEffect(() => {
    if (!turnoSeleccionado) return
    setCargando(true)
    Promise.all([
      getDoc(doc(db,'turnos',turnoSeleccionado)),
      getDocs(query(collection(db,'turnos',turnoSeleccionado,'incidencias'), orderBy('horaInicio','asc'))),
      getDocs(collection(db,'turnos',turnoSeleccionado,'produccion')),
    ]).then(([turnoSnap, incSnap, prodSnap]) => {
      setTurnoData(turnoSnap.exists() ? turnoSnap.data() : null)
      setIncidencias(incSnap.docs.map(d=>({id:d.id,...d.data()})).filter(i=>!i.eliminado))
      const prod = {}
      prodSnap.docs.forEach(d => {
        const data = d.data()
        prod[data.franja] = data
      })
      setProduccion(prod)
      setCargando(false)
    })
  }, [turnoSeleccionado])

  // ── cálculos ──────────────────────────────────────────────────────────────

  const cfg = turnoData || configTurno
  const franjas = cfg ? generarFranjas(cfg) : []
  const franjasActivas = franjas.filter(f => !esDescanso(f, cfg))

  const objG = cfg?.objetivoGrande || 350
  const objC = cfg?.objetivoChica  || 100

  const totalGrande = Object.values(produccion).reduce((a,p) => a + (p.grande ?? 0), 0)
  const totalChica  = Object.values(produccion).reduce((a,p) => a + (p.chica  ?? 0), 0)
  const totalProducido = totalGrande + totalChica

  const objTotalG = objG * franjasActivas.length
  const objTotalC = objC * franjasActivas.length
  const objTotal  = objTotalG + objTotalC

  const cumplimientoPct = objTotal > 0 ? Math.round(totalProducido / objTotal * 100) : 0
  const deltaTotal = totalProducido - objTotal

  // incidencias por sala (ambas → ambas salas)
  function incsPorSala(sala) {
    return incidencias.filter(i => i.sala === sala || i.sala === 'ambas')
  }
  const incsGrande = incsPorSala('grande')
  const incsChica  = incsPorSala('chica')

  function tiempoPerdidoSala(incs) {
    return incs.reduce((a,i) => a + minutos(i.horaInicio, i.horaFin), 0)
  }

  const tiempoGrande = tiempoPerdidoSala(incsGrande)
  const tiempoChica  = tiempoPerdidoSala(incsChica)
  const tiempoTotal  = incidencias.reduce((a,i) => a + minutos(i.horaInicio, i.horaFin), 0)

  // tiempo por categoría (todas las incidencias)
  const tiempoPorCat = incidencias.reduce((acc,i) => {
    if (i.categoriaNombre) {
      acc[i.categoriaNombre] = (acc[i.categoriaNombre] || 0) + minutos(i.horaInicio, i.horaFin)
    }
    return acc
  }, {})
  const catOrdenada = Object.entries(tiempoPorCat).sort((a,b)=>b[1]-a[1])
  const maxCatMin = catOrdenada[0]?.[1] || 1

  // sectores responsables
  const sectoresMap = incidencias.reduce((acc,i) => {
    const secs = i.sectoresResponsables || []
    secs.forEach(s => {
      if (!acc[s]) acc[s] = { incs: 0, tiempo: 0 }
      acc[s].incs++
      acc[s].tiempo += minutos(i.horaInicio, i.horaFin)
    })
    return acc
  }, {})
  const sectoresOrdenados = Object.entries(sectoresMap).sort((a,b)=>b[1].tiempo-a[1].tiempo)

  const criticas  = incidencias.filter(i=>i.grado==='critico').length
  const moderadas = incidencias.filter(i=>i.grado==='moderado').length

  // producción por sala en el gráfico
  const prodGrande = {}
  const prodChica  = {}
  Object.values(produccion).forEach(p => {
    if (p.franja) {
      prodGrande[p.franja] = { grande: p.grande }
      prodChica[p.franja]  = { chica:  p.chica  }
    }
  })

  // ── estilos base ──────────────────────────────────────────────────────────

  const card = {
    background:'#fff', borderRadius:'14px',
    border:'1px solid #EFEFED', padding:'18px 20px',
  }

  function GradoBadge({ grado }) {
    return (
      <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px',
        background: gradoBg[grado], color: gradoColor[grado], fontWeight:'700',
        flexShrink:0, textTransform:'uppercase', letterSpacing:'.03em' }}>
        {grado === 'critico' ? 'Crítico' : grado === 'moderado' ? 'Moderado' : grado === 'leve' ? 'Leve' : 'Info'}
      </span>
    )
  }

  function ListaIncidencias({ incs }) {
    if (incs.length === 0) return (
      <div style={{ fontSize:'12px', color:'#ccc', padding:'8px 0' }}>Sin incidencias</div>
    )
    return incs.map(inc => {
      const dur = minutos(inc.horaInicio, inc.horaFin)
      return (
        <div key={inc.id} style={{ display:'flex', alignItems:'center', gap:'8px',
          padding:'7px 0', borderBottom:'1px solid #F5F5F3' }}>
          <div style={{ width:'7px', height:'7px', borderRadius:'50%',
            background:gradoColor[inc.grado], flexShrink:0 }} />
          <span style={{ fontSize:'11px', color:'#999', minWidth:'36px', fontVariantNumeric:'tabular-nums' }}>
            {inc.horaInicio}
          </span>
          <span style={{ fontSize:'12px', color:'#333', flex:1, fontWeight:'500' }}>
            {inc.categoriaNombre}
          </span>
          <GradoBadge grado={inc.grado} />
          <span style={{ fontSize:'11px', color:'#aaa', minWidth:'28px', textAlign:'right' }}>
            {dur > 0 ? `${dur}m` : '—'}
          </span>
        </div>
      )
    })
  }

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',
      background:'#F7F7F5', minHeight:'100vh' }}>

      {/* header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #EFEFED',
        padding:'12px 32px', display:'flex', alignItems:'center', gap:'12px',
        position:'sticky', top:0, zIndex:5 }}>
        <button onClick={onVolver} style={{ fontSize:'13px', padding:'6px 12px',
          borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa',
          cursor:'pointer', color:'#555', fontWeight:'500' }}>← Volver</button>
        <span style={{ fontSize:'16px', fontWeight:'700', color:'#111' }}>Informe gerencial</span>
        <select value={turnoSeleccionado} onChange={e=>setTurnoSeleccionado(e.target.value)}
          style={{ fontSize:'13px', padding:'6px 12px', borderRadius:'8px',
            border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#333' }}>
          {turnos.map(t=>(
            <option key={t.id} value={t.id}>{t.fecha} · {t.nombre || 'Turno'}</option>
          ))}
        </select>
        <button onClick={() => window.print()} style={{ marginLeft:'auto',
          fontSize:'13px', padding:'6px 14px', borderRadius:'8px',
          border:'1px solid #185FA5', background:'#f0f6ff',
          cursor:'pointer', color:'#185FA5', fontWeight:'600' }}>🖨 Imprimir / PDF</button>
      </div>

      {cargando && (
        <div style={{ textAlign:'center', padding:'4rem', color:'#aaa', fontSize:'14px' }}>
          Cargando...
        </div>
      )}

      {!cargando && turnoData && (
        <div style={{ maxWidth:'960px', margin:'0 auto', padding:'28px 32px' }}>

          {/* título */}
          <div style={{ marginBottom:'20px' }}>
            <div style={{ fontSize:'11px', fontWeight:'600', color:'#aaa',
              textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'4px' }}>
              {turnoData.fecha}
            </div>
            <div style={{ fontSize:'22px', fontWeight:'700', color:'#111' }}>
              Resumen general
            </div>
          </div>

          {/* ── sección 1: KPIs ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)',
            gap:'10px', marginBottom:'24px' }}>
            {[
              {
                label: 'Total producido',
                valor: totalProducido.toLocaleString('es-AR'),
                sub: `de ${objTotal.toLocaleString('es-AR')} objetivo`,
                color: '#111',
              },
              {
                label: 'Cumplimiento',
                valor: `${cumplimientoPct}%`,
                sub: `${deltaTotal >= 0 ? '+' : ''}${deltaTotal.toLocaleString('es-AR')} cuartos`,
                color: cumplimientoPct >= 100 ? '#1D9E75' : '#E24B4A',
              },
              {
                label: 'Tiempo perdido',
                valor: tiempoTotal > 0 ? `${tiempoTotal} min` : '—',
                sub: 'en paradas',
                color: tiempoTotal > 0 ? '#E24B4A' : '#aaa',
              },
              {
                label: 'Incidencias',
                valor: incidencias.length,
                sub: `${criticas} críticas · ${moderadas} mod.`,
                color: '#111',
              },
            ].map(({ label, valor, sub, color }) => (
              <div key={label} style={{ ...card }}>
                <div style={{ fontSize:'11px', color:'#aaa', marginBottom:'6px', fontWeight:'500' }}>
                  {label}
                </div>
                <div style={{ fontSize:'26px', fontWeight:'700', color, lineHeight:1, marginBottom:'4px' }}>
                  {valor}
                </div>
                <div style={{ fontSize:'11px', color:'#bbb' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ── sección 2: por sala ── */}
          <div style={{ fontSize:'11px', fontWeight:'600', color:'#aaa',
            textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'12px' }}>
            Por sala
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'24px' }}>
            {[
              {
                nombre: 'Sala grande', sala: 'sala_grande',
                total: totalGrande, obj: objTotalG, objH: objG,
                tiempo: tiempoGrande, incs: incsGrande,
                prod: Object.fromEntries(franjas.map(f => [f, { sala_grande: produccion[f]?.grande }])),
              },
              {
                nombre: 'Sala chica', sala: 'sala_chica',
                total: totalChica, obj: objTotalC, objH: objC,
                tiempo: tiempoChica, incs: incsChica,
                prod: Object.fromEntries(franjas.map(f => [f, { sala_chica: produccion[f]?.chica }])),
              },
            ].map(({ nombre, sala, total, obj, objH, tiempo, incs, prod }) => {
              const pct = obj > 0 ? Math.round(total / obj * 100) : 0
              const delta = total - obj
              return (
                <div key={nombre} style={{ ...card, padding:'20px' }}>
                  {/* header sala */}
                  <div style={{ display:'flex', alignItems:'center',
                    justifyContent:'space-between', marginBottom:'14px' }}>
                    <div style={{ fontSize:'15px', fontWeight:'700', color:'#111' }}>{nombre}</div>
                    <div style={{ fontSize:'12px', fontWeight:'600',
                      color: pct >= 100 ? '#1D9E75' : '#E24B4A',
                      background: pct >= 100 ? '#edfbf4' : '#fef2f2',
                      padding:'3px 10px', borderRadius:'20px' }}>
                      {pct}% · {delta >= 0 ? '+' : ''}{delta}
                    </div>
                  </div>

                  {/* mini KPIs */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
                    gap:'8px', marginBottom:'14px' }}>
                    <div style={{ background:'#F7F7F5', borderRadius:'10px', padding:'10px 12px' }}>
                      <div style={{ fontSize:'10px', color:'#aaa', marginBottom:'3px' }}>Producido</div>
                      <div style={{ fontSize:'20px', fontWeight:'700', color:'#111', lineHeight:1 }}>
                        {total.toLocaleString('es-AR')}
                      </div>
                      <div style={{ fontSize:'10px', color:'#bbb', marginTop:'2px' }}>
                        de {obj.toLocaleString('es-AR')}
                      </div>
                    </div>
                    <div style={{ background:'#F7F7F5', borderRadius:'10px', padding:'10px 12px' }}>
                      <div style={{ fontSize:'10px', color:'#aaa', marginBottom:'3px' }}>Tiempo perdido</div>
                      <div style={{ fontSize:'20px', fontWeight:'700',
                        color: tiempo > 0 ? '#E24B4A' : '#aaa', lineHeight:1 }}>
                        {tiempo > 0 ? `${tiempo} min` : '—'}
                      </div>
                      <div style={{ fontSize:'10px', color:'#bbb', marginTop:'2px' }}>
                        {incs.length} incidencia{incs.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>

                  {/* gráfico */}
                  <div style={{ marginBottom:'2px' }}>
                    <div style={{ fontSize:'11px', fontWeight:'600', color:'#aaa',
                      marginBottom:'6px', textTransform:'uppercase', letterSpacing:'.06em' }}>
                      Cuartos hora a hora — {nombre.toLowerCase()}
                    </div>
                    <GraficoHoraAHora
                      franjas={franjas}
                      produccion={produccion}
                      objetivo={objH}
                      config={cfg}
                      sala={sala === 'sala_grande' ? 'grande' : 'chica'}
                    />
                  </div>

                  {/* leyenda */}
                  <div style={{ display:'flex', gap:'12px', marginBottom:'14px',
                    fontSize:'10px', color:'#888', alignItems:'center' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                      <span style={{ width:'10px', height:'10px', borderRadius:'2px',
                        background:'#1D9E75', display:'inline-block' }} />
                      Sobre objetivo
                    </span>
                    <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                      <span style={{ width:'10px', height:'10px', borderRadius:'2px',
                        background:'#E24B4A', display:'inline-block' }} />
                      Bajo objetivo
                    </span>
                    <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                      <span style={{ width:'10px', height:'2px',
                        background:'#C8B89A', display:'inline-block',
                        borderTop:'1.5px dashed #C8B89A' }} />
                      Objetivo
                    </span>
                    <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                      <span style={{ width:'10px', height:'10px', borderRadius:'2px',
                        background:'#DEDED8', display:'inline-block' }} />
                      Descanso
                    </span>
                  </div>

                  {/* incidencias de la sala */}
                  <div style={{ borderTop:'1px solid #F0F0EE', paddingTop:'12px' }}>
                    <div style={{ fontSize:'11px', fontWeight:'600', color:'#aaa',
                      textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px' }}>
                      Incidencias {nombre.toLowerCase()}
                    </div>
                    <ListaIncidencias incs={incs} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── sección 3 + 4: categorías y sectores ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>

            {/* tiempo perdido por categoría */}
            <div style={{ ...card }}>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#333', marginBottom:'14px' }}>
                Tiempo perdido por categoría (min)
              </div>
              {catOrdenada.length === 0 && (
                <div style={{ fontSize:'12px', color:'#ccc' }}>Sin datos</div>
              )}
              {catOrdenada.map(([cat, mins], idx) => (
                <div key={cat} style={{ display:'flex', alignItems:'center',
                  gap:'10px', marginBottom:'10px' }}>
                  <div style={{ fontSize:'12px', color:'#555', minWidth:'110px',
                    fontWeight:'500', flexShrink:0 }}>{cat}</div>
                  <div style={{ flex:1, background:'#F0F0EE', borderRadius:'4px',
                    height:'10px', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:'4px',
                      background: CAT_COLORES[idx] || '#888',
                      width: `${Math.round(mins / maxCatMin * 100)}%`,
                      transition: 'width .3s',
                    }} />
                  </div>
                  <div style={{ fontSize:'12px', fontWeight:'700', color:'#333',
                    minWidth:'32px', textAlign:'right' }}>{mins}m</div>
                </div>
              ))}
            </div>

            {/* sectores responsables */}
            <div style={{ ...card }}>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'#333', marginBottom:'14px' }}>
                Sectores responsables
              </div>
              {sectoresOrdenados.length === 0 && (
                <div style={{ fontSize:'12px', color:'#ccc' }}>Sin datos</div>
              )}
              {sectoresOrdenados.map(([sector, data], idx) => (
                <div key={sector} style={{ display:'flex', alignItems:'center',
                  gap:'10px', padding:'8px 0',
                  borderBottom: idx < sectoresOrdenados.length-1 ? '1px solid #F5F5F3' : 'none' }}>
                  <div style={{ fontSize:'13px', fontWeight:'700', color:'#BCBCB0',
                    minWidth:'18px', textAlign:'center' }}>{idx+1}</div>
                  <div style={{ flex:1, fontSize:'13px', fontWeight:'600', color:'#111' }}>
                    {sector}
                  </div>
                  <div style={{ fontSize:'11px', color:'#aaa' }}>
                    {data.incs} inc.
                  </div>
                  <div style={{ fontSize:'12px', fontWeight:'700', color:'#555',
                    minWidth:'38px', textAlign:'right' }}>
                    {data.tiempo > 0 ? `${data.tiempo}m` : '—'}
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
      )}

      {!cargando && !turnoData && turnoSeleccionado && (
        <div style={{ textAlign:'center', padding:'4rem', color:'#ccc', fontSize:'14px' }}>
          No hay datos para este turno
        </div>
      )}
    </div>
  )
}
