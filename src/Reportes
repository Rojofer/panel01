import { useState, useEffect, useMemo } from 'react'
import { collection, doc, getDoc, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from './firebase'

// ── Paleta ──────────────────────────────────────────────────────────────────
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
function Calendario({ y, m, datos, onDiaClick, diaSeleccionado }) {
  const total = diasEnMes(y, m)
  const primerDow = diaSemana(y, m, 1)
  const celdas = []

  // blancos antes del día 1
  for (let i = 0; i < primerDow; i++) celdas.push(null)
  for (let d = 1; d <= total; d++) celdas.push(d)

  return (
    <div>
      {/* cabecera días semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px', marginBottom: '3px' }}>
        {DIAS_CORTOS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '9px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      {/* grilla */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px' }}>
        {celdas.map((d, i) => {
          if (!d) return <div key={`b${i}`} />
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
                  {dato.incidencias > 0 && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.rojo, flexShrink: 0 }} />}
                </>
              )}
            </div>
          )
        })}
      </div>
      {/* leyenda */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
        {[['#1D9E75','#EDFBF4','≥100% objetivo'],['#BA7517','#FFF8EE','80–99%'],['#E24B4A','#FEF2F2','<80%'],['#ccc','#F7F7F5','Sin datos']].map(([c,bg,t]) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: bg, border: `1.5px solid ${c}` }} />
            <span style={{ fontSize: '10px', color: C.sub }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tabla principal ───────────────────────────────────────────────────────────
function TablaDias({ datos, onDiaClick }) {
  const [sortCol, setSortCol] = useState('fecha')
  const [sortDir, setSortDir] = useState('desc')

  const cols = [
    { key: 'fecha',         label: 'Fecha',       w: '90px' },
    { key: 'dia',           label: 'Día',         w: '50px' },
    { key: 'grande',        label: 'Grande',      w: '80px', num: true },
    { key: 'chica',         label: 'Chica',       w: '70px', num: true },
    { key: 'total',         label: 'Total',       w: '80px', num: true },
    { key: 'pct',           label: '% obj',       w: '70px', num: true },
    { key: 'incidencias',   label: 'Incs.',       w: '60px', num: true },
    { key: 'tiempoPerdido', label: 'T. perdido',  w: '90px', num: true },
    { key: 'estado',        label: 'Estado',      w: '80px' },
  ]

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const filas = useMemo(() => {
    return Object.values(datos).map(d => ({
      ...d,
      dia: DIAS_CORTOS[diaSemana(...d.fecha.split('-').map(Number))],
      pct: pct(d.total, d.objTotal),
    })).sort((a, b) => {
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
                <td style={{ padding: '9px 12px', fontWeight: '600', color: C.texto }}>{f.fecha}</td>
                <td style={{ padding: '9px 12px', color: C.sub }}>{f.dia}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '600', color: f.grande >= f.objGrande ? C.verde : C.rojo }}>{formatNum(f.grande)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '600', color: f.chica  >= f.objChica  ? C.verde : C.rojo }}>{formatNum(f.chica)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '800', color: C.texto }}>{formatNum(f.total)}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px', background: rowBg, color: rowColor }}>{p}%</span>
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: f.incidencias > 0 ? C.rojo : C.sub, fontWeight: f.incidencias > 0 ? '700' : '400' }}>{f.incidencias}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: f.tiempoPerdido > 0 ? C.naranja : C.sub }}>{f.tiempoPerdido > 0 ? `${f.tiempoPerdido}m` : '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: f.estado === 'cerrado' ? C.grisClaro : C.verdeClaro, color: f.estado === 'cerrado' ? C.gris : C.verde, fontWeight: '600' }}>{f.estado}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Modal detalle día ─────────────────────────────────────────────────────────
function ModalDia({ fecha, dato, onClose }) {
  if (!dato) return null
  const { y, m, d } = parseDate(fecha)
  const nombreDia = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][diaSemana(y,m,d)]
  const p = pct(dato.total, dato.objTotal)
  const pColor = p >= 100 ? C.verde : p >= 80 ? C.naranja : C.rojo

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 30 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '520px', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: '18px', zIndex: 31, fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* header */}
        <div style={{ padding: '22px 24px 18px', borderBottom: `1px solid ${C.borde}`, position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderRadius: '18px 18px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: C.texto }}>{nombreDia} {d} de {MESES[m-1]}</div>
              <div style={{ fontSize: '12px', color: C.sub, marginTop: '2px' }}>{fecha}</div>
            </div>
            <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', border: `1px solid ${C.borde}`, background: C.grisClaro, cursor: 'pointer', fontSize: '18px', color: C.sub }}>×</button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
            <KPICard label="Total producido" value={formatNum(dato.total)} sub={`obj ${formatNum(dato.objTotal)}`} />
            <KPICard label="Cumplimiento" value={`${p}%`} sub={`${dato.total >= dato.objTotal ? '+' : ''}${formatNum(dato.total - dato.objTotal)} cuartos`} color={pColor} bg={p >= 100 ? C.verdeClaro : p >= 80 ? C.naranjaClaro : C.rojoClaro} />
            <KPICard label="Incidencias" value={dato.incidencias} sub={dato.tiempoPerdido > 0 ? `${dato.tiempoPerdido} min perdidos` : 'Sin tiempo perdido'} color={dato.incidencias > 0 ? C.rojo : C.gris} />
          </div>

          {/* por sala */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            <div style={{ background: C.grisClaro, borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Sala grande</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: dato.grande >= dato.objGrande ? C.verde : C.rojo }}>{formatNum(dato.grande)}</div>
              <div style={{ fontSize: '11px', color: C.sub }}>obj {formatNum(dato.objGrande)} · {pct(dato.grande, dato.objGrande)}%</div>
            </div>
            <div style={{ background: C.grisClaro, borderRadius: '12px', padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Sala chica</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: dato.chica >= dato.objChica ? C.verde : C.rojo }}>{formatNum(dato.chica)}</div>
              <div style={{ fontSize: '11px', color: C.sub }}>obj {formatNum(dato.objChica)} · {pct(dato.chica, dato.objChica)}%</div>
            </div>
          </div>

          {/* desglose por línea */}
          {dato.lineas && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Producción por línea</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
                {Object.entries(dato.lineas).map(([l, v]) => {
                  const barPct = Math.round(v / dato.grande * 100)
                  return (
                    <div key={l} style={{ background: C.grisClaro, borderRadius: '10px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: C.sub, marginBottom: '6px' }}>{l}</div>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: C.azul }}>{formatNum(v)}</div>
                      <div style={{ height: '4px', background: '#e8e8e8', borderRadius: '2px', marginTop: '6px' }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: C.azul, borderRadius: '2px' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: C.sub, marginTop: '3px' }}>{barPct}% del total</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ background: C.azulClaro, border: `1px solid ${C.azulBorde}`, borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: C.azul }}>
            💡 Drill down completo disponible en Fase 2 — gráfico hora a hora e incidencias del turno
          </div>
        </div>
      </div>
    </>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Reportes({ onVolver }) {
  const hoy = new Date()
  const [mes, setMes]  = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [datos, setDatos] = useState({})
  const [cargando, setCargando] = useState(false)
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [vistaTabla, setVistaTabla] = useState(true)
  const [usarEjemplos, setUsarEjemplos] = useState(true)

  // ── Cargar datos ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (usarEjemplos) {
      setDatos(generarEjemplos(anio, mes))
      return
    }
    setCargando(true)
    // TODO Fase 2: conectar Firestore real
    // getDocs(collection(db,'turnos')).then(snap => { ... })
    setCargando(false)
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

      {/* header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${C.borde}`, padding: '0 24px', height: '54px', display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <button onClick={onVolver} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: `1px solid ${C.borde}`, background: C.grisClaro, cursor: 'pointer', color: C.sub }}>← Volver</button>
        <div style={{ fontSize: '16px', fontWeight: '800', color: C.texto, letterSpacing: '-0.3px' }}>Reportes</div>

        {/* nav mes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '16px' }}>
          <button onClick={() => navMes(-1)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${C.borde}`, background: '#fff', cursor: 'pointer', fontSize: '13px', color: C.sub }}>‹</button>
          <span style={{ fontSize: '14px', fontWeight: '700', color: C.texto, minWidth: '130px', textAlign: 'center' }}>{MESES[mes-1]} {anio}</span>
          <button onClick={() => navMes(1)} style={{ width: '26px', height: '26px', borderRadius: '6px', border: `1px solid ${C.borde}`, background: '#fff', cursor: 'pointer', fontSize: '13px', color: C.sub }}>›</button>
        </div>

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

      <div style={{ padding: '20px 24px', maxWidth: '1200px', margin: '0 auto' }}>

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
                <Calendario y={anio} m={mes} datos={datos} onDiaClick={setDiaSeleccionado} diaSeleccionado={diaSeleccionado} />
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

        {/* nota fases futuras */}
        <div style={{ marginTop: '20px', background: C.azulClaro, border: `1px solid ${C.azulBorde}`, borderRadius: '12px', padding: '14px 18px', fontSize: '12px', color: C.azul, lineHeight: 1.6 }}>
          <strong>Fase 1 completa</strong> — KPIs del mes, calendario con colores, tabla ordenable. <br/>
          <span style={{ opacity: .7 }}>Próximo: Fase 2 (drill down a día con gráfico hora a hora) · Fase 3 (Vista semana) · Fase 4 (Comparador)</span>
        </div>
      </div>

      {/* modal detalle día */}
      {diaSeleccionado && (
        <ModalDia fecha={diaSeleccionado} dato={datos[diaSeleccionado]} onClose={() => setDiaSeleccionado(null)} />
      )}
    </div>
  )
}
