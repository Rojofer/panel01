import { useState, useEffect, useMemo } from 'react'
import { collection, doc, getDoc, getDocs, query, orderBy, updateDoc } from 'firebase/firestore'
import GraficoHoraAHora, { getDescansoParcial, generarFranjas } from './GraficoHoraAHora'
import { db } from './firebase'

// ── Paleta ──────────────────────────────────────────────────────────────────
const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
const gradoBg    = { critico: '#fef2f2', moderado: '#fff8ee', leve: '#f0f6ff', informativo: '#edfbf4' }
const C = {
  verde:   '#1D9E75', verdeClaro: '#EDFBF4', verdeBorde: '#A8DFC8',
  rojo:    '#E24B4A', rojoClaro:  '#FEF2F2', rojoBorde:  '#F5C0BF',
  naranja: '#BA7517', naranjaClaro: '#FFF8EE',
  azul:    '#185FA5', azulClaro:  '#EFF5FF', azulBorde:  '#B5D4F4',
  gris:    '#888780', grisClaro:  '#F7F7F5', grisBorde:  '#E8E8E4',
  fondo:   '#F4F4F1', borde: '#E8E8E5', texto: '#111', sub: '#888',
}

// ── Utilidades ───────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0') }
function fechaStr(y, m, d) { return `${y}-${pad(m)}-${pad(d)}` }
function parseDate(str) { const [y,m,d] = str.split('-').map(Number); return { y, m, d } }
function diasEnMes(y, m) { return new Date(y, m, 0).getDate() }
function diaSemana(y, m, d) { return new Date(y, m-1, d).getDay() } // 0=dom

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_CORTOS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

function numeroSemana(y, m, d) {
  const date = new Date(y, m-1, d)
  const inicio = new Date(date.getFullYear(), 0, 1)
  return Math.ceil(((date - inicio) / 86400000 + inicio.getDay() + 1) / 7)
}

function calcMetricasDia(d) {
  const pi = d.primerIngresoGrande || d.primerIngresoChica
  const ui = d.ultimoIngresoGrande || d.ultimoIngresoChica
  if (!pi || !ui) return { tiempoNeto: null, descansos: null }
  const [h1,m1] = pi.split(':').map(Number)
  const [h2,m2] = ui.split(':').map(Number)
  const dur = (h2*60+m2) - (h1*60+m1)
  if (dur <= 0) return { tiempoNeto: null, descansos: null }
  const descG = (d.descansosGrande||[]).reduce((s,x)=>s+Number(x.dur||0),0)
  const descC = (d.descansosChica||[]).reduce((s,x)=>s+Number(x.dur||0),0)
  const descansos = Math.round((descG + descC) / 2)
  return { tiempoNeto: dur - descansos, descansos }
}

function formatNum(n) { return n?.toLocaleString('es-AR') ?? '—' }
function pct(prod, obj) { return obj > 0 ? Math.round(prod / obj * 100) : 0 }

// ── Datos de ejemplo ─────────────────────────────────────────────────────────
function generarEjemplos(y, m) {
  const total = diasEnMes(y, m)
  const obj = { grande: 350, chica: 100, franjas: 10 }
  const result = {}
  for (let d = 1; d <= total; d++) {
    const dow = diaSemana(y, m, d)
    if (dow === 0) continue // sin domingos
    const r = Math.random()
    if (r < 0.08) continue // ~8% sin datos
    const grande = Math.round((200 + Math.random() * 300) * 10) / 10
    const chica  = Math.round((50  + Math.random() * 120) * 10) / 10
    const incCant = Math.floor(Math.random() * 8)
    const tiempoPerdido = Math.floor(Math.random() * 60)
    result[fechaStr(y, m, d)] = {
      fecha: fechaStr(y, m, d),
      estado: 'cerrado',
      grande, chica,
      total: Math.round(grande + chica),
      objGrande: obj.grande * obj.franjas,
      objChica:  obj.chica  * obj.franjas,
      objTotal:  (obj.grande + obj.chica) * obj.franjas,
      incidencias: incCant,
      tiempoPerdido,
      lineas: {
        L1: Math.round(grande * 0.28),
        L2: Math.round(grande * 0.26),
        L3: Math.round(grande * 0.24),
        L4: Math.round(grande * 0.22),
      }
    }
  }
  return result
}

// ── Componente KPI ────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, bg, border, small }) {
  return (
    <div style={{ background: bg || C.grisClaro, borderRadius: '12px', border: `1px solid ${border || C.grisBorde}`, padding: '12px 16px' }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: small ? '18px' : '24px', fontWeight: '800', color: color || C.texto, lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: C.sub, marginTop: '4px', fontWeight: '500' }}>{sub}</div>}
    </div>
  )
}

// ── Calendario ────────────────────────────────────────────────────────────────
function Calendario({ y, m, datos, onDiaClick, diaSeleccionado, onSemanaClick }) {
  const total = diasEnMes(y, m)
  const primerDow = diaSemana(y, m, 1)
  const celdas = []
  for (let i = 0; i < primerDow; i++) celdas.push(null)
  for (let d = 1; d <= total; d++) celdas.push(d)
  while (celdas.length % 7 !== 0) celdas.push(null)

  // agrupar en filas de 7
  const filas = []
  for (let i = 0; i < celdas.length; i += 7) filas.push(celdas.slice(i, i + 7))

  return (
    <div>
      {/* cabecera */}
      <div style={{ display: 'grid', gridTemplateColumns: '30px repeat(7,1fr)', gap: '3px', marginBottom: '3px' }}>
        <div style={{ textAlign: 'center', fontSize: '8px', fontWeight: '700', color: '#ccc', textTransform: 'uppercase', padding: '4px 0' }}>SEM</div>
        {DIAS_CORTOS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '9px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      {/* filas con número de semana */}
      {filas.map((fila, fi) => {
        const primerDiaFila = fila.find(d => d != null)
        const numSem = primerDiaFila ? numeroSemana(y, m, primerDiaFila) : null
        return (
          <div key={fi} style={{ display: 'grid', gridTemplateColumns: '30px repeat(7,1fr)', gap: '3px', marginBottom: '3px' }}>
            {/* número de semana */}
            <div onClick={() => numSem && onSemanaClick && onSemanaClick(numSem)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#fff', borderRadius: '7px', fontSize: '11px', fontWeight: '800', cursor: onSemanaClick ? 'pointer' : 'default', minHeight: '52px' }}>
              {numSem}
            </div>
            {fila.map((d, i) => {
              if (!d) return <div key={`b${fi}-${i}`} />
              const fecha = fechaStr(y, m, d)
              const dato  = datos[fecha]
              const sel   = diaSeleccionado === fecha
              const dow   = diaSemana(y, m, d)
              const esDom = dow === 0
              let bg = '#fff', borde = C.grisBorde, numColor = C.sub
              if (esDom) { bg = '#FAFAF8'; numColor = '#ccc' }
              else if (!dato) { bg = '#F7F7F5'; numColor = '#ccc' }
              else {
                const p = pct(dato.total, dato.objTotal)
                if (p >= 100) { bg = C.verdeClaro; borde = C.verdeBorde; numColor = C.verde }
                else if (p >= 80) { bg = C.naranjaClaro; borde = '#F5D79A'; numColor = C.naranja }
                else { bg = C.rojoClaro; borde = C.rojoBorde; numColor = C.rojo }
              }
              return (
                <div key={fecha} onClick={() => dato && onDiaClick(fecha)}
                  style={{ background: sel ? C.azulClaro : bg, border: `1.5px solid ${sel ? C.azul : borde}`, borderRadius: '8px', padding: '6px 4px', cursor: dato ? 'pointer' : 'default', minHeight: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', transition: 'all .1s' }}>
                  <span style={{ fontSize: '11px', fontWeight: sel ? '800' : '600', color: sel ? C.azul : numColor }}>{d}</span>
                  {dato && (
                    <>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: sel ? C.azul : numColor }}>{formatNum(dato.total)}</span>
                      <span style={{ fontSize: '8px', color: sel ? C.azul : C.sub }}>{pct(dato.total, dato.objTotal)}%</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {/* leyenda */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
        {[['#1D9E75','#EDFBF4','≥100% objetivo'],['#BA7517','#FFF8EE','80–99%'],['#E24B4A','#FEF2F2','<80%'],['#ccc','#F7F7F5','Sin datos']].map(([c,bg,t]) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: bg, border: `1.5px solid ${c}` }} />
            <span style={{ fontSize: '10px', color: C.sub }}>{t}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#111' }} />
          <span style={{ fontSize: '10px', color: C.sub }}>Click → vista semanal</span>
        </div>
      </div>
    </div>
  )
}

// ── Tabla principal ───────────────────────────────────────────────────────────
function TablaDias({ datos, onDiaClick }) {
  const [sortCol, setSortCol] = useState('fecha')
  const [sortDir, setSortDir] = useState('desc')

  const cols = [
    { key: 'fecha',      label: 'Fecha',        w: '90px' },
    { key: 'dia',        label: 'Día',          w: '44px' },
    { key: 'grande',     label: 'Grande',       w: '72px', num: true },
    { key: 'chica',      label: 'Chica',        w: '66px', num: true },
    { key: 'total',      label: 'Total',        w: '72px', num: true },
    { key: 'pct',        label: '% obj',        w: '60px', num: true },
    { key: 'tiempoNeto', label: 'T. neto',      w: '72px', num: true },
    { key: 'descansos',  label: 'Descanso',     w: '72px', num: true },
    { key: 'L1',         label: 'L1',           w: '56px', num: true },
    { key: 'L2',         label: 'L2',           w: '56px', num: true },
    { key: 'L3',         label: 'L3',           w: '56px', num: true },
    { key: 'L4',         label: 'L4',           w: '56px', num: true },
    { key: 'L5',         label: 'L5',           w: '56px', num: true },
  ]

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const filas = useMemo(() => {
    return Object.values(datos).map(d => {
      // tiempo neto
      const pi = d.primerIngresoGrande || d.primerIngresoChica
      const ui = d.ultimoIngresoGrande || d.ultimoIngresoChica
      let tiempoNeto = null, descansos = null
      if (pi && ui) {
        const [h1,m1] = pi.split(':').map(Number)
        const [h2,m2] = ui.split(':').map(Number)
        const dur = (h2*60+m2) - (h1*60+m1)
        const descG = (d.descansosGrande||[]).reduce((s,x)=>s+Number(x.dur||0),0)
        const descC = (d.descansosChica||[]).reduce((s,x)=>s+Number(x.dur||0),0)
        descansos = Math.round((descG + descC) / 2)
        tiempoNeto = dur - descansos
      }
      // lineas acumuladas
      const prod = d.produccionData || {}
      const linTotales = {}
      ;['L1','L2','L3','L4'].forEach(l => {
        const t = Object.values(prod).reduce((s,p)=>s+(p.lineas?.[l]||0),0)
        linTotales[l] = t > 0 ? t : null
      })
      linTotales['L5'] = d.chica > 0 ? d.chica : null
      return {
        ...d,
        dia: DIAS_CORTOS[diaSemana(...d.fecha.split('-').map(Number))],
        pct: pct(d.total, d.objTotal),
        tiempoNeto, descansos,
        L1: linTotales.L1, L2: linTotales.L2, L3: linTotales.L3, L4: linTotales.L4, L5: linTotales.L5,
      }
    }).sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol]
      if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase()
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })
  }, [datos, sortCol, sortDir])

  function chevron(col) {
    if (sortCol !== col) return <span style={{ color: '#ddd', fontSize: '9px' }}>↕</span>
    return <span style={{ color: C.azul, fontSize: '9px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${C.borde}` }}>
            {cols.map(c => (
              <th key={c.key} onClick={() => toggleSort(c.key)}
                style={{ padding: '8px 12px', textAlign: c.num ? 'right' : 'left', fontSize: '10px', fontWeight: '700', color: sortCol === c.key ? C.azul : C.sub, textTransform: 'uppercase', letterSpacing: '.06em', cursor: 'pointer', whiteSpace: 'nowrap', width: c.w, userSelect: 'none' }}>
                {c.label} {chevron(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const p = f.pct
            const rowColor = p >= 100 ? C.verde : p >= 80 ? C.naranja : C.rojo
            const rowBg = p >= 100 ? C.verdeClaro : p >= 80 ? C.naranjaClaro : C.rojoClaro
            return (
              <tr key={f.fecha} onClick={() => onDiaClick(f.fecha)}
                style={{ borderBottom: `1px solid ${C.borde}`, background: i % 2 === 0 ? '#fff' : '#FAFAF8', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = C.azulClaro}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFAF8'}>
                <td style={{ padding: '8px 10px', fontWeight: '600', color: C.texto, whiteSpace: 'nowrap' }}>{f.fecha}</td>
                <td style={{ padding: '8px 6px', color: C.sub, fontSize: '11px' }}>{f.dia}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '600', color: f.grande >= f.objGrande ? C.verde : C.rojo }}>{formatNum(f.grande)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '600', color: f.chica  >= f.objChica  ? C.verde : C.rojo }}>{formatNum(f.chica)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: C.texto }}>{formatNum(f.total)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '20px', background: rowBg, color: rowColor }}>{p}%</span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: f.tiempoNeto ? C.texto : C.sub, fontWeight: '500' }}>{f.tiempoNeto ? `${f.tiempoNeto}m` : '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: f.descansos > 0 ? C.naranja : C.sub }}>{f.descansos > 0 ? `${f.descansos}m` : '—'}</td>
                {['L1','L2','L3','L4','L5'].map(l => (
                  <td key={l} style={{ padding: '8px 10px', textAlign: 'right', color: f[l] ? (l==='L5'?C.naranja:C.azul) : '#ddd', fontSize: '11px', fontWeight: f[l] ? '600' : '400' }}>{f[l] ? formatNum(f[l]) : '—'}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Modal detalle día ─────────────────────────────────────────────────────────
function ModalDia({ fecha, dato, config, onClose }) {
  const [franjaGrafico, setFranjaGrafico] = useState(null)
  if (!dato) return null
  const { y, m, d } = parseDate(fecha)
  const nombreDia = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][diaSemana(y,m,d)]
  const p = pct(dato.total, dato.objTotal)
  const pColor = p >= 100 ? C.verde : p >= 80 ? C.naranja : C.rojo
  const prod = dato.produccionData || {}
  const incs = dato.incidenciasData || []
  const franjas = config ? generarFranjas(config) : []
  const objG = config?.objetivoGrande || 350
  const objC = config?.objetivoChica  || 100

  // lineas acumuladas del día
  const lineasTotales = ['L1','L2','L3','L4'].reduce((acc, l) => {
    const total = Object.values(prod).reduce((s,p) => s + (p.lineas?.[l]||0), 0)
    if (total > 0) acc[l] = total
    return acc
  }, {})
  // L5 = sala chica total
  if (dato.chica > 0) lineasTotales['L5'] = dato.chica

  // tiempo productivo neto
  const calcTiempoNeto = () => {
    const pi = dato.primerIngresoGrande || dato.primerIngresoChica
    const ui = dato.ultimoIngresoGrande || dato.ultimoIngresoChica
    if (!pi || !ui) return null
    const [h1,m1] = pi.split(':').map(Number)
    const [h2,m2] = ui.split(':').map(Number)
    const duracion = (h2*60+m2) - (h1*60+m1)
    if (duracion <= 0) return null
    const descG = (dato.descansosGrande||[]).reduce((s,d)=>s+Number(d.dur||0),0)
    const descC = (dato.descansosChica||[]).reduce((s,d)=>s+Number(d.dur||0),0)
    const descTotal = Math.round((descG + descC) / 2) // promedio si son distintos
    const neto = duracion - descTotal
    return { duracion, descTotal, neto, pi, ui }
  }
  const tiempoNeto = calcTiempoNeto()

  // incidencias por categoría para ranking
  const rankingCat = incs.filter(i=>i.grado!=='informativo').reduce((acc,i) => {
    const k = i.categoriaNombre||'Sin categoría'
    acc[k] = (acc[k]||0) + 1
    return acc
  }, {})
  const rankingOrdenado = Object.entries(rankingCat).sort((a,b)=>b[1]-a[1])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 30 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '760px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: '18px', zIndex: 31, fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* header sticky */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.borde}`, position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderRadius: '18px 18px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: C.texto }}>{nombreDia} {d} de {MESES[m-1]} de {y}</div>
              <div style={{ fontSize: '11px', color: C.sub, marginTop: '2px' }}>{fecha} · <span style={{ color: dato.estado === 'cerrado' ? C.gris : C.verde, fontWeight: '600' }}>{dato.estado}</span></div>
            </div>
            <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', border: `1px solid ${C.borde}`, background: C.grisClaro, cursor: 'pointer', fontSize: '18px', color: C.sub }}>×</button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* KPIs fila — compactos */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {/* total */}
            <div style={{ background: C.grisClaro, borderRadius: '10px', padding: '8px 14px', border: `1px solid ${C.grisBorde}` }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>Total producido</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '20px', fontWeight: '800', color: C.texto, letterSpacing: '-0.5px' }}>{formatNum(dato.total)}</span>
                <span style={{ fontSize: '10px', color: C.sub }}>de {formatNum(dato.objTotal)}</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: pColor }}>{p}%</span>
              </div>
            </div>
            {/* grande */}
            <div style={{ background: C.grisClaro, borderRadius: '10px', padding: '8px 14px', border: `1px solid ${C.grisBorde}` }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>Sala grande</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '20px', fontWeight: '800', color: dato.grande >= dato.objGrande ? C.verde : C.rojo, letterSpacing: '-0.5px' }}>{formatNum(dato.grande)}</span>
                <span style={{ fontSize: '10px', color: C.sub }}>obj {formatNum(dato.objGrande)}</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: dato.grande >= dato.objGrande ? C.verde : C.rojo }}>{pct(dato.grande,dato.objGrande)}%</span>
              </div>
            </div>
            {/* chica */}
            <div style={{ background: C.grisClaro, borderRadius: '10px', padding: '8px 14px', border: `1px solid ${C.grisBorde}` }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>Sala chica</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '20px', fontWeight: '800', color: dato.chica >= dato.objChica ? C.verde : C.rojo, letterSpacing: '-0.5px' }}>{formatNum(dato.chica)}</span>
                <span style={{ fontSize: '10px', color: C.sub }}>obj {formatNum(dato.objChica)}</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: dato.chica >= dato.objChica ? C.verde : C.rojo }}>{pct(dato.chica,dato.objChica)}%</span>
              </div>
            </div>
            {tiempoNeto && (
              <div style={{ background: C.grisClaro, borderRadius: '10px', padding: '8px 14px', border: `1px solid ${C.grisBorde}` }}>
                <div style={{ fontSize: '9px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>Tiempo neto</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '20px', fontWeight: '800', color: C.texto, letterSpacing: '-0.5px' }}>{tiempoNeto.neto}m</span>
                  <span style={{ fontSize: '10px', color: C.sub }}>{tiempoNeto.pi} → {tiempoNeto.ui}</span>
                </div>
                <div style={{ fontSize: '10px', color: C.sub, marginTop: '1px' }}>
                  {tiempoNeto.duracion}m turno · {tiempoNeto.descTotal > 0 ? `−${tiempoNeto.descTotal}m descanso` : 'sin descanso'}
                </div>
              </div>
            )}
          </div>

          {/* Gráficos hora a hora */}
          {franjas.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: C.texto, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '12px' }}>Producción hora a hora</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[{label:'Sala grande',sala:'grande',obj:objG},{label:'Sala chica',sala:'chica',obj:objC}].map(({label,sala,obj})=>(
                  <GraficoHoraAHora key={sala}
                    franjas={franjas} produccion={prod} objetivo={obj} config={config}
                    sala={sala} incidencias={incs} label={label}
                    franjaSeleccionada={franjaGrafico}
                    onSelectFranja={f => setFranjaGrafico(prev => prev === f ? null : f)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* desglose por línea */}
          {Object.keys(lineasTotales).length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Producción por línea</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Object.keys(lineasTotales).length},1fr)`, gap: '6px' }}>
                {Object.entries(lineasTotales).map(([l,v]) => {
                  const barPct = l==='L5' ? Math.round(v / dato.chica * 100) : Math.round(v / dato.grande * 100)
                  return (
                    <div key={l} style={{ background: l==='L5'?C.naranjaClaro:C.azulClaro, borderRadius: '8px', padding: '8px 10px', border: `1px solid ${l==='L5'?'#F5D79A':C.azulBorde}` }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: l==='L5'?C.naranja:C.azul, marginBottom: '1px' }}>{l}{l==='L5'&&<span style={{fontSize:'8px',opacity:.6,marginLeft:'3px'}}>chica</span>}</div>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: l==='L5'?C.naranja:C.azul }}>{formatNum(v)}</div>
                      <div style={{ height: '4px', background: l==='L5'?'#f5e6c0':'#dce8f5', borderRadius: '2px', marginTop: '8px' }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: l==='L5'?C.naranja:C.azul, borderRadius: '2px' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: C.sub, marginTop: '3px' }}>{barPct}% del total</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Incidencias */}
          {incs.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em' }}>Incidencias del turno</div>
                {rankingOrdenado.length > 0 && (
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {rankingOrdenado.slice(0,3).map(([cat,n]) => (
                      <span key={cat} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: C.rojoClaro, color: C.rojo, fontWeight: '600' }}>{cat} ×{n}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ border: `1px solid ${C.borde}`, borderRadius: '10px', overflow: 'hidden' }}>
                {incs.map((inc, i) => {
                  const [h1,m1]=(inc.horaInicio||'0:0').split(':').map(Number)
                  const [h2,m2]=(inc.horaFin||'0:0').split(':').map(Number)
                  const dur = inc.horaFin ? Math.max(0,(h2*60+m2)-(h1*60+m1)) : null
                  return (
                    <div key={inc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderBottom: i < incs.length-1 ? `1px solid ${C.borde}` : 'none', background: i%2===0 ? '#fff' : C.grisClaro }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: gradoColor[inc.grado]||C.gris, flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', color: C.sub, minWidth: '40px', fontVariantNumeric: 'tabular-nums' }}>{inc.horaInicio}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: C.texto, flex: 1 }}>{inc.categoriaNombre}</span>
                      {inc.sala && <span style={{ fontSize: '10px', color: C.sub }}>{inc.sala}</span>}
                      <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '20px', background: gradoBg[inc.grado]||C.grisClaro, color: gradoColor[inc.grado]||C.gris, fontWeight: '700' }}>{inc.grado}</span>
                      {dur !== null && dur > 0 && <span style={{ fontSize: '11px', color: C.sub, minWidth: '28px', textAlign: 'right' }}>{dur}m</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {incs.length === 0 && franjas.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#ccc', fontSize: '13px' }}>Sin datos detallados para este día</div>
          )}

          {/* Nota del día */}
          <NotaDia turnoId={dato.turnoId} notaInicial={dato.notaDia} />
        </div>
      </div>
    </>
  )
}

function NotaDia({ turnoId, notaInicial }) {
  const [nota, setNota] = useState(notaInicial || '')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  async function guardar() {
    if (!turnoId) return
    setGuardando(true)
    await updateDoc(doc(db,'turnos',turnoId), { notaDia: nota })
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em' }}>Nota del día</div>
        {guardado && <span style={{ fontSize: '10px', color: C.verde, fontWeight: '600' }}>✓ Guardado</span>}
      </div>
      <textarea
        value={nota}
        onChange={e => setNota(e.target.value)}
        onBlur={guardar}
        placeholder="Agregá una nota sobre este turno..."
        style={{ width: '100%', minHeight: '80px', fontSize: '13px', borderRadius: '10px', border: `1.5px solid ${C.borde}`, padding: '10px 12px', fontFamily: 'inherit', lineHeight: '1.5', resize: 'vertical', boxSizing: 'border-box', color: C.texto, background: guardando ? C.grisClaro : '#fff' }}
      />
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
// ── Vista semanal ─────────────────────────────────────────────────────────────
function VistaSemana({ datos, anio, mes, semana, onSemanaChange, onDiaClick }) {
  const dias = Object.values(datos)
    .filter(d => {
      const [y, m, dd] = d.fecha.split('-').map(Number)
      return numeroSemana(y, m, dd) === semana
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const kpis = useMemo(() => {
    if (!dias.length) return null
    const totalG = dias.reduce((s,d) => s + d.grande, 0)
    const totalC = dias.reduce((s,d) => s + d.chica, 0)
    const total  = totalG + totalC
    const obj    = dias.reduce((s,d) => s + d.objTotal, 0)
    const netoTotal = dias.reduce((s,d) => s + (calcMetricasDia(d).tiempoNeto || 0), 0)
    const eficiencia = netoTotal > 0 ? Math.round(total / (netoTotal / 60)) : null
    const mejor = dias.reduce((b,d) => d.total > (b?.total||0) ? d : b, null)
    const peor  = dias.reduce((w,d) => d.total < (w?.total||Infinity) ? d : w, null)
    return { totalG, totalC, total, obj, cumplimiento: pct(total, obj), eficiencia, netoTotal, mejor, peor, diasTrabajados: dias.length }
  }, [datos, semana])

  // gráfico barras por día
  const W = 700, H = 200, PT = 24, PB = 30, PX = 30
  const maxVal = Math.max(...dias.map(d => Math.max(d.total, d.objTotal)), 1) * 1.15
  const slot = dias.length > 0 ? (W - PX * 2) / dias.length : 0
  const barW = Math.max(20, Math.min(64, slot - 24))

  return (
    <div>
      {/* nav semana */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <button onClick={() => onSemanaChange(semana - 1)} style={{ width: '28px', height: '28px', borderRadius: '7px', border: `1px solid ${C.borde}`, background: '#fff', cursor: 'pointer', fontSize: '14px', color: C.sub }}>‹</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#111', color: '#fff', borderRadius: '8px', padding: '4px 10px', lineHeight: 1 }}>
            <span style={{ fontSize: '7px', fontWeight: '600', letterSpacing: '.1em', opacity: .6 }}>SEM</span>
            <span style={{ fontSize: '18px', fontWeight: '800' }}>{semana}</span>
          </div>
          <span style={{ fontSize: '13px', fontWeight: '600', color: C.sub }}>{MESES[mes-1]} {anio}</span>
        </div>
        <button onClick={() => onSemanaChange(semana + 1)} style={{ width: '28px', height: '28px', borderRadius: '7px', border: `1px solid ${C.borde}`, background: '#fff', cursor: 'pointer', fontSize: '14px', color: C.sub }}>›</button>
      </div>

      {!kpis && <div style={{ textAlign: 'center', padding: '50px', color: '#ccc', fontSize: '13px' }}>Sin datos para la semana {semana}</div>}

      {kpis && (
        <>
          {/* KPIs semana */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              ['Total semana', formatNum(kpis.total), `de ${formatNum(kpis.obj)}`, kpis.cumplimiento >= 100 ? C.verde : kpis.cumplimiento >= 80 ? C.naranja : C.rojo, `${kpis.cumplimiento}%`],
              ['Sala grande', formatNum(kpis.totalG), null, C.texto, null],
              ['Sala chica', formatNum(kpis.totalC), null, C.texto, null],
              ['Eficiencia', kpis.eficiencia ? `${kpis.eficiencia}/h` : '—', kpis.netoTotal > 0 ? `${Math.round(kpis.netoTotal/60)}h netas` : null, C.azul, null],
              ['Días trabajados', kpis.diasTrabajados, null, C.texto, null],
              ['Mejor día', kpis.mejor ? formatNum(kpis.mejor.total) : '—', kpis.mejor?.fecha.slice(8), C.verde, null],
            ].map(([label, value, sub, color, badge]) => (
              <div key={label} style={{ background: C.grisClaro, borderRadius: '10px', padding: '8px 14px', border: `1px solid ${C.grisBorde}` }}>
                <div style={{ fontSize: '9px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '19px', fontWeight: '800', color, letterSpacing: '-0.5px' }}>{value}</span>
                  {badge && <span style={{ fontSize: '11px', fontWeight: '700', color }}>{badge}</span>}
                  {sub && <span style={{ fontSize: '10px', color: C.sub }}>{sub}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* gráfico barras por día */}
          <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${C.borde}`, padding: '16px 18px', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px' }}>Producción por día</div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
              {dias.map((d, i) => {
                const x = PX + i * slot + (slot - barW) / 2
                const xc = x + barW / 2
                const hG = Math.round((d.grande / maxVal) * (H - PT - PB))
                const hC = Math.round((d.chica  / maxVal) * (H - PT - PB))
                const yObj = PT + (H - PT - PB) - Math.round((d.objTotal / maxVal) * (H - PT - PB))
                const p = pct(d.total, d.objTotal)
                const color = p >= 100 ? '#1D9E75' : p >= 80 ? '#BA7517' : '#E24B4A'
                const [yy,mm,dd] = d.fecha.split('-').map(Number)
                const nombreDia = DIAS_CORTOS[diaSemana(yy,mm,dd)]
                return (
                  <g key={d.fecha} onClick={() => onDiaClick(d.fecha)} style={{ cursor: 'pointer' }}>
                    {/* barra apilada: chica arriba de grande */}
                    <rect x={x} y={H-PB-hG} width={barW} height={hG} fill={color} rx="3" opacity=".9" />
                    <rect x={x} y={H-PB-hG-hC} width={barW} height={hC} fill={color} rx="3" opacity=".45" />
                    {/* línea objetivo */}
                    <line x1={x-4} y1={yObj} x2={x+barW+4} y2={yObj} stroke="#C8B89A" strokeWidth="1.3" strokeDasharray="4 2" />
                    <text x={xc} y={H-PB-hG-hC-6} textAnchor="middle" fontSize="11" fontWeight="700" fill={color} fontFamily="system-ui">{formatNum(d.total)}</text>
                    <text x={xc} y={H-PB+14} textAnchor="middle" fontSize="10" fontWeight="700" fill="#555" fontFamily="system-ui">{nombreDia} {dd}</text>
                    <text x={xc} y={H-PB+26} textAnchor="middle" fontSize="9" fontWeight="600" fill={color} fontFamily="system-ui">{p}%</text>
                  </g>
                )
              })}
            </svg>
            <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: C.sub }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#1D9E75', opacity: .9 }} />Grande</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: C.sub }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#1D9E75', opacity: .45 }} />Chica</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: C.sub }}><span style={{ width: '14px', height: '0', borderTop: '1.5px dashed #C8B89A' }} />Objetivo</span>
            </div>
          </div>

          {/* tabla de la semana */}
          <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${C.borde}`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.borde}`, fontSize: '11px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Días de la semana {semana}
            </div>
            <TablaDias datos={Object.fromEntries(dias.map(d => [d.fecha, d]))} onDiaClick={onDiaClick} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Resumen mensual gerencial ─────────────────────────────────────────────────
function ResumenMensual({ datos, anio, mes, onSemanaClick }) {
  const lista = Object.values(datos)

  const resumen = useMemo(() => {
    if (!lista.length) return null
    const totalG = lista.reduce((s,d) => s + d.grande, 0)
    const totalC = lista.reduce((s,d) => s + d.chica, 0)
    const total  = totalG + totalC
    const obj    = lista.reduce((s,d) => s + d.objTotal, 0)
    const netoTotal = lista.reduce((s,d) => s + (calcMetricasDia(d).tiempoNeto || 0), 0)
    const eficiencia = netoTotal > 0 ? Math.round(total / (netoTotal / 60)) : null
    const bajoObjetivo = lista.filter(d => pct(d.total, d.objTotal) < 100).length

    // eficiencia por línea
    const lineasEf = {}
    ;['L1','L2','L3','L4'].forEach(l => {
      const t = lista.reduce((s,d) => s + Object.values(d.produccionData||{}).reduce((ss,p)=>ss+(p.lineas?.[l]||0),0), 0)
      if (t > 0) lineasEf[l] = t
    })

    // agrupar por semana
    const porSemana = {}
    lista.forEach(d => {
      const [y, m, dd] = d.fecha.split('-').map(Number)
      const sem = numeroSemana(y, m, dd)
      if (!porSemana[sem]) porSemana[sem] = { semana: sem, dias: 0, grande: 0, chica: 0, total: 0, obj: 0, neto: 0 }
      const ps = porSemana[sem]
      ps.dias++; ps.grande += d.grande; ps.chica += d.chica; ps.total += d.total; ps.obj += d.objTotal
      ps.neto += calcMetricasDia(d).tiempoNeto || 0
    })
    const semanas = Object.values(porSemana).sort((a,b) => a.semana - b.semana).map(s => ({
      ...s,
      cumplimiento: pct(s.total, s.obj),
      eficiencia: s.neto > 0 ? Math.round(s.total / (s.neto / 60)) : null,
    }))
    const mejorSemana = semanas.reduce((b,s) => s.total > (b?.total||0) ? s : b, null)

    return { totalG, totalC, total, obj, cumplimiento: pct(total, obj), eficiencia, netoTotal, bajoObjetivo, diasTrabajados: lista.length, semanas, mejorSemana, lineasEf, aporteG: total > 0 ? Math.round(totalG/total*100) : 0 }
  }, [datos])

  if (!resumen) return <div style={{ textAlign: 'center', padding: '50px', color: '#ccc' }}>Sin datos para el resumen</div>

  // tendencia semanal: gráfico de barras
  const W = 700, H = 180, PT = 24, PB = 28, PX = 40
  const maxSem = Math.max(...resumen.semanas.map(s => Math.max(s.total, s.obj)), 1) * 1.15
  const slotS = resumen.semanas.length > 0 ? (W - PX*2) / resumen.semanas.length : 0
  const barWS = Math.max(30, Math.min(80, slotS - 30))

  return (
    <div className="print-area">
      {/* título para impresión */}
      <div className="print-only" style={{ display: 'none' }}>
        <h1 style={{ fontSize: '20px', margin: '0 0 4px' }}>Resumen mensual — {MESES[mes-1]} {anio}</h1>
        <p style={{ fontSize: '11px', color: '#888', margin: '0 0 16px' }}>Panel de Control · generado {new Date().toLocaleDateString('es-AR')}</p>
      </div>

      {/* bloque ejecutivo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '12px' }}>
        <KPICard label="Total producido" value={formatNum(resumen.total)} sub={`de ${formatNum(resumen.obj)} objetivo`} />
        <KPICard label="Cumplimiento" value={`${resumen.cumplimiento}%`} sub={`${resumen.total >= resumen.obj ? '+' : ''}${formatNum(resumen.total - resumen.obj)} cuartos`} color={resumen.cumplimiento >= 100 ? C.verde : resumen.cumplimiento >= 80 ? C.naranja : C.rojo} bg={resumen.cumplimiento >= 100 ? C.verdeClaro : resumen.cumplimiento >= 80 ? C.naranjaClaro : C.rojoClaro} />
        <KPICard label="Eficiencia" value={resumen.eficiencia ? `${resumen.eficiencia}/h` : '—'} sub={resumen.netoTotal > 0 ? `${Math.round(resumen.netoTotal/60)}h productivas netas` : 'sin datos de ingresos'} color={C.azul} bg={C.azulClaro} border={C.azulBorde} />
        <KPICard label="Días" value={resumen.diasTrabajados} sub={`${resumen.bajoObjetivo} bajo objetivo`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '20px' }}>
        <KPICard label="Sala grande" value={formatNum(resumen.totalG)} sub={`${resumen.aporteG}% del total`} small />
        <KPICard label="Sala chica" value={formatNum(resumen.totalC)} sub={`${100-resumen.aporteG}% del total`} small />
        <KPICard label="Mejor semana" value={resumen.mejorSemana ? `SEM ${resumen.mejorSemana.semana}` : '—'} sub={resumen.mejorSemana ? formatNum(resumen.mejorSemana.total) : null} color={C.verde} bg={C.verdeClaro} border={C.verdeBorde} small />
        <div style={{ background: C.grisClaro, borderRadius: '12px', border: `1px solid ${C.grisBorde}`, padding: '12px 16px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '6px' }}>Producción por línea</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(resumen.lineasEf).map(([l,v]) => (
              <span key={l} style={{ fontSize: '11px', fontWeight: '700', color: C.azul }}>{l}: <span style={{ color: C.texto }}>{formatNum(v)}</span></span>
            ))}
            {Object.keys(resumen.lineasEf).length === 0 && <span style={{ fontSize: '11px', color: '#ccc' }}>Sin datos por línea</span>}
          </div>
        </div>
      </div>

      {/* tendencia semanal */}
      <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${C.borde}`, padding: '16px 18px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px' }}>Tendencia semanal</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
          {resumen.semanas.map((s, i) => {
            const x = PX + i * slotS + (slotS - barWS) / 2
            const xc = x + barWS / 2
            const hT = Math.round((s.total / maxSem) * (H - PT - PB))
            const yObj = PT + (H - PT - PB) - Math.round((s.obj / maxSem) * (H - PT - PB))
            const color = s.cumplimiento >= 100 ? '#1D9E75' : s.cumplimiento >= 80 ? '#BA7517' : '#E24B4A'
            return (
              <g key={s.semana} onClick={() => onSemanaClick && onSemanaClick(s.semana)} style={{ cursor: 'pointer' }}>
                <rect x={x} y={H-PB-hT} width={barWS} height={hT} fill={color} rx="4" opacity=".88" />
                <line x1={x-5} y1={yObj} x2={x+barWS+5} y2={yObj} stroke="#C8B89A" strokeWidth="1.3" strokeDasharray="4 2" />
                <text x={xc} y={H-PB-hT-6} textAnchor="middle" fontSize="11" fontWeight="700" fill={color} fontFamily="system-ui">{formatNum(s.total)}</text>
                <text x={xc} y={H-PB+14} textAnchor="middle" fontSize="10" fontWeight="700" fill="#555" fontFamily="system-ui">SEM {s.semana}</text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* tabla de semanas */}
      <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${C.borde}`, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.borde}`, fontSize: '11px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Semanas del mes <span style={{ fontSize: '10px', color: '#ccc', fontWeight: '400', textTransform: 'none' }}>· click para detalle</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.borde}` }}>
              {['Semana','Días','Grande','Chica','Total','% obj','Eficiencia'].map((h,i) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: '10px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumen.semanas.map((s, i) => {
              const color = s.cumplimiento >= 100 ? C.verde : s.cumplimiento >= 80 ? C.naranja : C.rojo
              const bg = s.cumplimiento >= 100 ? C.verdeClaro : s.cumplimiento >= 80 ? C.naranjaClaro : C.rojoClaro
              return (
                <tr key={s.semana} onClick={() => onSemanaClick && onSemanaClick(s.semana)}
                  style={{ borderBottom: `1px solid ${C.borde}`, background: i % 2 === 0 ? '#fff' : '#FAFAF8', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.azulClaro}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFAF8'}>
                  <td style={{ padding: '9px 12px', fontWeight: '800', color: C.texto }}>SEM {s.semana}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: C.sub }}>{s.dias}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '600' }}>{formatNum(s.grande)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '600' }}>{formatNum(s.chica)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '800' }}>{formatNum(s.total)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px', background: bg, color }}>{s.cumplimiento}%</span>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: C.azul, fontWeight: '600' }}>{s.eficiencia ? `${s.eficiencia}/h` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Reportes({ onVolver }) {
  const hoy = new Date()
  const [mes, setMes]  = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [datos, setDatos] = useState({})
  const [cargando, setCargando] = useState(false)
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [vistaTabla, setVistaTabla] = useState(true)
  const [usarEjemplos, setUsarEjemplos] = useState(true)
  const [config, setConfig] = useState(null)
  const [vista, setVista] = useState('mes') // 'mes' | 'semana' | 'resumen'
  const [semanaSel, setSemanaSel] = useState(numeroSemana(hoy.getFullYear(), hoy.getMonth()+1, hoy.getDate()))

  // Cargar config una sola vez
  useEffect(() => {
    getDoc(doc(db,'config','turno')).then(s => { if (s.exists()) setConfig(s.data()) })
  }, [])

  // ── Cargar datos ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (usarEjemplos) {
      setDatos(generarEjemplos(anio, mes))
      return
    }
    setCargando(true)
    setDatos({})
    const mesStr = String(mes).padStart(2,'0')
    const prefijo = `${anio}-${mesStr}`
    getDocs(collection(db,'turnos')).then(async snap => {
      const turnosMes = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.fecha?.startsWith(prefijo))
      const resultado = {}
      await Promise.all(turnosMes.map(async turno => {
        const [prodSnap] = await Promise.all([
          getDocs(collection(db,'turnos',turno.id,'produccion')),
        ])
        const prod = {}
        prodSnap.docs.forEach(d => { prod[d.data().franja] = d.data() })
        const grande = Object.values(prod).reduce((s,p) => s + (p.grande||0), 0)
        const chica  = Object.values(prod).reduce((s,p) => s + (p.chica||0), 0)
        // incidencias: cargar para KPIs
        const incSnap = await getDocs(collection(db,'turnos',turno.id,'incidencias'))
        const incidencias = incSnap.docs.map(d => ({id:d.id,...d.data()})).filter(i => !i.eliminado)
        const tiempoPerdido = incidencias.filter(i=>i.grado!=='informativo'&&i.horaInicio&&i.horaFin).reduce((s,i)=>{
          const [h1,m1]=(i.horaInicio||'0:0').split(':').map(Number)
          const [h2,m2]=(i.horaFin||'0:0').split(':').map(Number)
          return s + Math.max(0,(h2*60+m2)-(h1*60+m1))
        },0)
        const objG = (turno.objetivoGrande||350) * 10
        const objC = (turno.objetivoChica||100) * 10
        resultado[turno.fecha] = {
          fecha: turno.fecha, turnoId: turno.id, estado: turno.estado,
          grande, chica, total: grande + chica,
          objGrande: objG, objChica: objC, objTotal: objG + objC,
          incidencias: incidencias.length, tiempoPerdido,
          produccionData: prod, incidenciasData: incidencias,
          lineas: null,
          primerIngresoGrande: turno.primerIngresoGrande || null,
          primerIngresoChica:  turno.primerIngresoChica  || null,
          ultimoIngresoGrande: turno.ultimoIngresoGrande || null,
          ultimoIngresoChica:  turno.ultimoIngresoChica  || null,
          descansosGrande: turno.descansosGrande || [],
          descansosChica:  turno.descansosChica  || [],
          notaDia: turno.notaDia || '',
        }
      }))
      setDatos(resultado)
      setCargando(false)
    })
  }, [mes, anio, usarEjemplos])

  // ── KPIs del mes ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const lista = Object.values(datos)
    if (!lista.length) return null
    const totalG    = lista.reduce((s, d) => s + d.grande, 0)
    const totalC    = lista.reduce((s, d) => s + d.chica,  0)
    const totalProd = lista.reduce((s, d) => s + d.total,  0)
    const totalObj  = lista.reduce((s, d) => s + d.objTotal, 0)
    const diasConDatos = lista.length
    const diasSinDatos = diasEnMes(anio, mes) - diasConDatos - lista.filter((_,i) => {
      const d = parseInt(Object.keys(datos)[i]?.split('-')[2])
      return diaSemana(anio, mes, d) === 0
    }).length
    const mejorDia  = lista.reduce((best, d) => d.total > (best?.total || 0) ? d : best, null)
    const peorDia   = lista.reduce((worst, d) => d.total < (worst?.total || Infinity) ? d : worst, null)
    const totalIncs = lista.reduce((s, d) => s + d.incidencias, 0)
    const totalTiempo = lista.reduce((s, d) => s + d.tiempoPerdido, 0)
    const promDiario = Math.round(totalProd / diasConDatos)
    return { totalG, totalC, totalProd, totalObj, diasConDatos, diasSinDatos: Math.max(0, diasSinDatos), mejorDia, peorDia, totalIncs, totalTiempo, promDiario, cumplimiento: pct(totalProd, totalObj) }
  }, [datos])

  function navMes(delta) {
    let nm = mes + delta, na = anio
    if (nm < 1) { nm = 12; na-- }
    if (nm > 12) { nm = 1;  na++ }
    setMes(nm); setAnio(na)
  }

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: C.fondo, minHeight: '100vh' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px !important; }
          .print-only { display: block !important; }
          button { display: none !important; }
        }
      `}</style>

      {/* header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${C.borde}`, padding: '0 24px', height: '54px', display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <button onClick={onVolver} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: `1px solid ${C.borde}`, background: C.grisClaro, cursor: 'pointer', color: C.sub }}>← Volver</button>
        <div style={{ fontSize: '16px', fontWeight: '800', color: C.texto, letterSpacing: '-0.3px' }}>Reportes</div>

        {/* tabs */}
        <div style={{ display: 'flex', background: C.grisClaro, borderRadius: '8px', padding: '2px', border: `1px solid ${C.borde}` }}>
          {[['mes','Mes'],['semana','Semana'],['resumen','Resumen']].map(([v,label]) => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: '4px 14px', borderRadius: '6px', border: 'none', background: vista === v ? '#fff' : 'transparent', cursor: 'pointer', fontSize: '12px', color: vista === v ? C.texto : C.sub, fontWeight: vista === v ? '700' : '400', boxShadow: vista === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        {/* nav mes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => navMes(-1)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${C.borde}`, background: '#fff', cursor: 'pointer', fontSize: '13px', color: C.sub }}>‹</button>
          <span style={{ fontSize: '14px', fontWeight: '700', color: C.texto, minWidth: '130px', textAlign: 'center' }}>{MESES[mes-1]} {anio}</span>
          <button onClick={() => navMes(1)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${C.borde}`, background: '#fff', cursor: 'pointer', fontSize: '13px', color: C.sub }}>›</button>
        </div>

        {/* export PDF */}
        <button onClick={() => window.print()} style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '7px', border: `1px solid ${C.azulBorde}`, background: C.azulClaro, cursor: 'pointer', color: C.azul, fontWeight: '600' }}>
          🖨 Exportar PDF
        </button>

        {/* toggle datos ejemplo/real */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: C.sub }}>Datos:</span>
          <button onClick={() => setUsarEjemplos(!usarEjemplos)}
            style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '20px', border: `1px solid ${usarEjemplos ? C.naranja : C.azul}`, background: usarEjemplos ? C.naranjaClaro : C.azulClaro, color: usarEjemplos ? C.naranja : C.azul, cursor: 'pointer', fontWeight: '600' }}>
            {usarEjemplos ? '⚡ Ejemplo' : '🔥 Real'}
          </button>
          {/* toggle calendario/tabla */}
          <div style={{ display: 'flex', background: C.grisClaro, borderRadius: '8px', padding: '2px', border: `1px solid ${C.borde}` }}>
            {[['📅', true, 'Calendario'], ['📋', false, 'Tabla']].map(([icon, v, label]) => (
              <button key={label} onClick={() => setVistaTabla(!v)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: vistaTabla !== v ? '#fff' : 'transparent', cursor: 'pointer', fontSize: '11px', color: vistaTabla !== v ? C.texto : C.sub, fontWeight: vistaTabla !== v ? '600' : '400', boxShadow: vistaTabla !== v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: '1200px', margin: '0 auto' }} className="print-area">

        {vista === 'semana' && (
          <VistaSemana datos={datos} anio={anio} mes={mes} semana={semanaSel}
            onSemanaChange={s => setSemanaSel(s)} onDiaClick={setDiaSeleccionado} />
        )}

        {vista === 'resumen' && (
          <ResumenMensual datos={datos} anio={anio} mes={mes}
            onSemanaClick={s => { setSemanaSel(s); setVista('semana') }} />
        )}

        {vista === 'mes' && (<>

        {/* KPIs del mes */}
        {kpis && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '20px' }}>
            <KPICard label="Total producido" value={formatNum(kpis.totalProd)} sub={`de ${formatNum(kpis.totalObj)} objetivo`} />
            <KPICard label="Cumplimiento" value={`${kpis.cumplimiento}%`} sub={`${kpis.totalProd >= kpis.totalObj ? '+' : ''}${formatNum(kpis.totalProd - kpis.totalObj)} cuartos`} color={kpis.cumplimiento >= 100 ? C.verde : kpis.cumplimiento >= 80 ? C.naranja : C.rojo} bg={kpis.cumplimiento >= 100 ? C.verdeClaro : kpis.cumplimiento >= 80 ? C.naranjaClaro : C.rojoClaro} border={kpis.cumplimiento >= 100 ? C.verdeBorde : kpis.cumplimiento >= 80 ? '#F5D79A' : C.rojoBorde} />
            <KPICard label="Incidencias totales" value={kpis.totalIncs} sub={`${kpis.totalTiempo} min perdidos`} color={kpis.totalIncs > 0 ? C.rojo : C.gris} />
            <KPICard label="Promedio diario" value={formatNum(kpis.promDiario)} sub={`${kpis.diasConDatos} días con datos · ${kpis.diasSinDatos} sin datos`} />
          </div>
        )}

        {/* fila secundaria de KPIs */}
        {kpis && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '24px' }}>
            <KPICard label="Sala grande total" value={formatNum(kpis.totalG)} small />
            <KPICard label="Sala chica total" value={formatNum(kpis.totalC)} small />
            <KPICard label="Mejor día" value={kpis.mejorDia ? formatNum(kpis.mejorDia.total) : '—'} sub={kpis.mejorDia?.fecha} color={C.verde} bg={C.verdeClaro} border={C.verdeBorde} small />
            <KPICard label="Día más bajo" value={kpis.peorDia ? formatNum(kpis.peorDia.total) : '—'} sub={kpis.peorDia?.fecha} color={C.rojo} bg={C.rojoClaro} border={C.rojoBorde} small />
          </div>
        )}

        {cargando && <div style={{ textAlign: 'center', padding: '40px', color: C.sub }}>Cargando datos...</div>}

        {!cargando && Object.keys(datos).length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#ccc', fontSize: '14px' }}>Sin datos para {MESES[mes-1]} {anio}</div>
        )}

        {!cargando && Object.keys(datos).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: vistaTabla ? '1fr' : 'minmax(0,480px) 1fr', gap: '20px', alignItems: 'start' }}>

            {/* calendario */}
            {!vistaTabla && (
              <div style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${C.borde}`, padding: '18px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '14px' }}>Calendario</div>
                <Calendario y={anio} m={mes} datos={datos} onDiaClick={setDiaSeleccionado} diaSeleccionado={diaSeleccionado} onSemanaClick={s => { setSemanaSel(s); setVista('semana') }} />
              </div>
            )}

            {/* tabla */}
            <div style={{ background: '#fff', borderRadius: '14px', border: `1px solid ${C.borde}`, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borde}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                  Días del mes <span style={{ color: C.azul, fontWeight: '800' }}>({Object.keys(datos).length})</span>
                </div>
                <div style={{ fontSize: '10px', color: '#ccc' }}>Click en fila para detalle</div>
              </div>
              <TablaDias datos={datos} onDiaClick={setDiaSeleccionado} />
            </div>
          </div>
        )}

        </>)}

      </div>

      {/* modal detalle día */}
      {diaSeleccionado && (
        <ModalDia fecha={diaSeleccionado} dato={datos[diaSeleccionado]} config={config} onClose={() => setDiaSeleccionado(null)} />
      )}
    </div>
  )
}
