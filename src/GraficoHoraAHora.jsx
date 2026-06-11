import { useState } from 'react'

const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
const gradoBg    = { critico: '#fef2f2', moderado: '#fff8ee', leve: '#f0f6ff', informativo: '#edfbf4' }

export function getDescansoParcial(franja, config, descSala) {
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

export default function GraficoHoraAHora({ franjas, produccion, objetivo, config, sala, incidencias, label, franjaSeleccionada, onSelectFranja, primerIngreso, ultimoIngreso, descSala }) {
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
        <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'10px'}}>
          {primerIngreso && <span style={{fontSize:'11px',fontWeight:'600',color:'#888',display:'flex',alignItems:'center',gap:'3px'}}><span style={{fontSize:'10px',color:'#aaa'}}>↓</span>{primerIngreso}</span>}
          {ultimoIngreso && <span style={{fontSize:'11px',fontWeight:'600',color:'#888',display:'flex',alignItems:'center',gap:'3px'}}><span style={{fontSize:'10px',color:'#aaa'}}>↑</span>{ultimoIngreso}</span>}
          {descLabel && <span style={{fontSize:'11px',fontWeight:'600',color:'#888',display:'flex',alignItems:'center',gap:'3px'}}> | Break: {descLabel}</span>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'auto',display:'block',cursor:'pointer'}}>
        {/* eje Y + grid */}
        {gridLines.map(({v, y}) => (
          <g key={v}>
            {/* línea de grid */}
            <line x1={AXIS_W} y1={y} x2={W} y2={y}
              stroke={v === 0 ? '#BBBBB5' : '#EBEBE8'}
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

export function generarFranjas(config) {
  const franjas = []
  const hIni = parseInt(config.inicio)
  const hFin = parseInt(config.fin)
  for (let h = hIni; h < hFin; h++) {
    franjas.push(`${String(h).padStart(2,'0')}:00-${String(h+1).padStart(2,'0')}:00`)
  }
  return franjas
}
