import { useState, useEffect } from 'react'
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

const DESCANSO_VACIO = { hora: '', min: 0, dur: 0 }

export default function Produccion({ turnoId, config, onClose }) {
  const [produccion, setProduccion] = useState({})
  const [editando, setEditando] = useState(null)
  const [grande, setGrande] = useState('')
  const [chica, setChica] = useState('')
  const [saving, setSaving] = useState(false)

  // ingresos
  const [primerIngresoGrande, setPrimerIngresoGrande] = useState('')
  const [primerIngresoChica,  setPrimerIngresoChica]  = useState('')
  const [ultimoIngresoGrande, setUltimoIngresoGrande] = useState('')
  const [ultimoIngresoChica,  setUltimoIngresoChica]  = useState('')

  // descansos: array de {hora, min, dur} por sala
  const [descansosGrande, setDescansosGrande] = useState([{...DESCANSO_VACIO}, {...DESCANSO_VACIO}])
  const [descansosChica,  setDescansosChica]  = useState([{...DESCANSO_VACIO}, {...DESCANSO_VACIO}])

  // colapsables
  const [openPrimer,   setOpenPrimer]   = useState(false)
  const [openUltimo,   setOpenUltimo]   = useState(false)
  const [openDescanso, setOpenDescanso] = useState(false)

  const franjas       = config ? generarFranjas(config) : []
  const primeraFranja = franjas[0]
  const ultimaFranja  = franjas[franjas.length - 1]
  const objG = config?.objetivoGrande || 350
  const objC = config?.objetivoChica  || 100

  useEffect(() => {
    if (!turnoId) return
    getDocs(collection(db,'turnos',turnoId,'produccion')).then(snap => {
      const data = {}
      snap.docs.forEach(d => { data[d.data().franja] = d.data() })
      setProduccion(data)
    })
    getDoc(doc(db,'turnos',turnoId)).then(s => {
      if (!s.exists()) return
      const d = s.data()
      if (d.primerIngresoGrande) setPrimerIngresoGrande(d.primerIngresoGrande)
      if (d.primerIngresoChica)  setPrimerIngresoChica(d.primerIngresoChica)
      if (d.ultimoIngresoGrande) setUltimoIngresoGrande(d.ultimoIngresoGrande)
      if (d.ultimoIngresoChica)  setUltimoIngresoChica(d.ultimoIngresoChica)
      if (d.descansosGrande) setDescansosGrande(d.descansosGrande)
      if (d.descansosChica)  setDescansosChica(d.descansosChica)
    })
  }, [turnoId])

  async function guardarCampo(campo, valor) {
    await updateDoc(doc(db,'turnos',turnoId), { [campo]: valor })
  }

  async function guardarDescansos() {
    await updateDoc(doc(db,'turnos',turnoId), { descansosGrande, descansosChica })
  }

  function updateDescanso(sala, idx, field, value) {
    const setter = sala === 'grande' ? setDescansosGrande : setDescansosChica
    setter(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
  }

  function addDescanso(sala) {
    const setter = sala === 'grande' ? setDescansosGrande : setDescansosChica
    setter(prev => [...prev, {...DESCANSO_VACIO}])
  }

  function removeDescanso(sala, idx) {
    const setter = sala === 'grande' ? setDescansosGrande : setDescansosChica
    setter(prev => prev.filter((_, i) => i !== idx))
  }

  function abrirEditar(franja) {
    setEditando(franja)
    setGrande(produccion[franja]?.grande ?? '')
    setChica(produccion[franja]?.chica   ?? '')
  }

  async function guardar() {
    if (!editando) return
    setSaving(true)
    const franjaId = editando.replace(/:/g,'').replace('-','_')
    const data = {
      franja: editando,
      grande: grande === '' ? null : Number(grande),
      chica:  chica  === '' ? null : Number(chica),
      cargadoEn: serverTimestamp()
    }
    await setDoc(doc(db,'turnos',turnoId,'produccion',franjaId), data)
    setProduccion(p => ({ ...p, [editando]: data }))
    setEditando(null)
    setSaving(false)
  }

  // ── estilos ──
  const inputTime = (val, onChange, onBlurSave) => (
    <input type="time" value={val}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlurSave}
      style={{ width:'100%', fontSize:'14px', fontWeight:'600', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'6px 8px', background:'#fff', boxSizing:'border-box' }} />
  )
  const inputNum = (val, onChange, onBlurSave, ph) => (
    <input type="number" value={val} placeholder={ph}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlurSave}
      style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'6px 8px', background:'#fff', boxSizing:'border-box', textAlign:'center' }} />
  )
  const lbl = t => <div style={{ fontSize:'9px', color:'#bbb', fontWeight:'600', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'4px' }}>{t}</div>

  function SectionHeader({ title, open, setOpen, summary }) {
    return (
      <div onClick={() => setOpen(!open)}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none', padding:'10px 14px', background: open ? '#F0F6FF' : '#F7F7F5', borderRadius: open ? '10px 10px 0 0' : '10px', border:`1px solid ${open ? '#C8DCF5' : '#EFEFED'}`, transition:'background .15s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'11px', fontWeight:'700', color: open ? '#185FA5' : '#555', textTransform:'uppercase', letterSpacing:'.07em' }}>{title}</span>
          {!open && summary && <span style={{ fontSize:'10px', color:'#185FA5', fontWeight:'600' }}>{summary}</span>}
        </div>
        <span style={{ fontSize:'9px', color:'#aaa', transform: open ? 'rotate(180deg)' : 'none', display:'inline-block', transition:'transform .2s' }}>▼</span>
      </div>
    )
  }

  // resumen para mostrar en collapsed
  const resumenPrimer = [primerIngresoGrande && `G:${primerIngresoGrande}`, primerIngresoChica && `Ch:${primerIngresoChica}`].filter(Boolean).join(' · ')
  const resumenUltimo = [ultimoIngresoGrande && `G:${ultimoIngresoGrande}`, ultimoIngresoChica && `Ch:${ultimoIngresoChica}`].filter(Boolean).join(' · ')
  const resumenDesc = descansosGrande.filter(d => d.hora !== '').length + descansosChica.filter(d => d.hora !== '').length
  const resumenDescStr = resumenDesc > 0 ? `${resumenDesc} configurado${resumenDesc > 1 ? 's' : ''}` : null

  const innerStyle = { border:'1px solid #C8DCF5', borderTop:'none', borderRadius:'0 0 10px 10px', padding:'12px 14px', background:'#fff', marginBottom:'10px' }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.25)', zIndex:10, backdropFilter:'blur(2px)' }} />
      <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', position:'fixed', top:0, right:0, bottom:0, width:'420px', background:'#fff', borderLeft:'1px solid #f0f0f0', zIndex:11, display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.1)' }}>

        {/* header */}
        <div style={{ padding:'18px 20px 14px', borderBottom:'1px solid #f0f0f0', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:'18px', fontWeight:'700', color:'#111' }}>Producción</div>
            <button onClick={onClose} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1.5px solid #e8e8e8', background:'#fafafa', cursor:'pointer', fontSize:'18px', color:'#888', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'14px 20px' }}>

          {/* ── Primer ingreso ── */}
          <div style={{ marginBottom: openPrimer ? 0 : '10px' }}>
            <SectionHeader title="Primer ingreso" open={openPrimer} setOpen={setOpenPrimer} summary={resumenPrimer} />
            {openPrimer && (
              <div style={innerStyle}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                  <div>{lbl('Sala grande')}{inputTime(primerIngresoGrande, setPrimerIngresoGrande, () => guardarCampo('primerIngresoGrande', primerIngresoGrande))}</div>
                  <div>{lbl('Sala chica')}{inputTime(primerIngresoChica, setPrimerIngresoChica, () => guardarCampo('primerIngresoChica', primerIngresoChica))}</div>
                </div>
              </div>
            )}
          </div>

          {/* ── Último ingreso ── */}
          <div style={{ marginBottom: openUltimo ? 0 : '10px' }}>
            <SectionHeader title="Último ingreso" open={openUltimo} setOpen={setOpenUltimo} summary={resumenUltimo} />
            {openUltimo && (
              <div style={innerStyle}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                  <div>{lbl('Sala grande')}{inputTime(ultimoIngresoGrande, setUltimoIngresoGrande, () => guardarCampo('ultimoIngresoGrande', ultimoIngresoGrande))}</div>
                  <div>{lbl('Sala chica')}{inputTime(ultimoIngresoChica, setUltimoIngresoChica, () => guardarCampo('ultimoIngresoChica', ultimoIngresoChica))}</div>
                </div>
              </div>
            )}
          </div>

          {/* ── Descansos ── */}
          <div style={{ marginBottom: openDescanso ? 0 : '16px' }}>
            <SectionHeader title="Descansos" open={openDescanso} setOpen={setOpenDescanso} summary={resumenDescStr} />
            {openDescanso && (
              <div style={innerStyle}>
                {[
                  { label: 'Sala grande', descansos: descansosGrande, sala: 'grande' },
                  { label: 'Sala chica',  descansos: descansosChica,  sala: 'chica'  },
                ].map(({ label, descansos, sala }) => (
                  <div key={sala} style={{ marginBottom:'14px' }}>
                    <div style={{ fontSize:'11px', fontWeight:'700', color:'#555', marginBottom:'8px' }}>{label}</div>
                    {descansos.map((d, idx) => (
                      <div key={idx} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 2fr auto', gap:'6px', alignItems:'flex-end', marginBottom:'6px' }}>
                        <div>{lbl(idx === 0 ? 'Hora inicio' : ' ')}{inputNum(d.hora, v => updateDescanso(sala, idx, 'hora', v), guardarDescansos, 'ej: 7')}</div>
                        <div>{lbl(idx === 0 ? 'Min' : ' ')}{inputNum(d.min, v => updateDescanso(sala, idx, 'min', v), guardarDescansos, '0')}</div>
                        <div>{lbl(idx === 0 ? 'Duración (min)' : ' ')}{inputNum(d.dur, v => updateDescanso(sala, idx, 'dur', v), guardarDescansos, 'min')}</div>
                        <button onClick={() => { removeDescanso(sala, idx); setTimeout(guardarDescansos, 0) }}
                          style={{ width:'28px', height:'32px', borderRadius:'7px', border:'1px solid #fde8e8', background:'#fef9f9', cursor:'pointer', color:'#E24B4A', fontSize:'14px', flexShrink:0, marginBottom:'1px' }}>×</button>
                      </div>
                    ))}
                    <button onClick={() => addDescanso(sala)}
                      style={{ fontSize:'11px', padding:'5px 12px', borderRadius:'8px', border:'1.5px dashed #b5d4f4', background:'#f0f6ff', color:'#185FA5', cursor:'pointer', fontWeight:'500', width:'100%' }}>
                      + Agregar descanso
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Separador ── */}
          <div style={{ fontSize:'10px', fontWeight:'700', color:'#bbb', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:'10px' }}>Franjas horarias</div>

          {/* ── Lista de franjas ── */}
          {franjas.map(franja => {
            const prod      = produccion[franja]
            const esEdit    = editando === franja
            const esPrimera = franja === primeraFranja
            const esUltima  = franja === ultimaFranja
            return (
              <div key={franja} style={{ marginBottom:'6px', background: esEdit ? '#f8fbff' : '#fff', border:`1px solid ${esEdit ? '#185FA5' : '#EFEFED'}`, borderRadius:'10px', padding:'10px 12px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: esEdit ? '10px' : '0' }}>
                  <div>
                    <span style={{ fontSize:'13px', fontWeight:'600', color:'#333' }}>{franja.replace('-',' — ')}</span>
                    {esPrimera && (primerIngresoGrande || primerIngresoChica) && !esEdit && (
                      <span style={{ fontSize:'9px', color:'#185FA5', marginLeft:'8px', fontWeight:'600' }}>▶ G:{primerIngresoGrande||'—'} Ch:{primerIngresoChica||'—'}</span>
                    )}
                    {esUltima && (ultimoIngresoGrande || ultimoIngresoChica) && !esEdit && (
                      <span style={{ fontSize:'9px', color:'#BA7517', marginLeft:'8px', fontWeight:'600' }}>⏹ G:{ultimoIngresoGrande||'—'} Ch:{ultimoIngresoChica||'—'}</span>
                    )}
                  </div>
                  {!esEdit && (
                    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                      {prod ? (
                        <div style={{ display:'flex', gap:'8px', fontSize:'12px' }}>
                          <span style={{ color: prod.grande >= objG ? '#1D9E75' : '#E24B4A' }}>G: <strong>{prod.grande ?? '—'}</strong></span>
                          <span style={{ color: prod.chica  >= objC ? '#1D9E75' : '#E24B4A' }}>Ch: <strong>{prod.chica ?? '—'}</strong></span>
                        </div>
                      ) : <span style={{ fontSize:'11px', color:'#ccc' }}>sin datos</span>}
                      <button onClick={() => abrirEditar(franja)} style={{ fontSize:'11px', padding:'3px 9px', borderRadius:'7px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#555' }}>
                        {prod ? '✏️' : '+'}
                      </button>
                    </div>
                  )}
                </div>
                {esEdit && (
                  <div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
                      <div>
                        <div style={{ fontSize:'11px', color:'#aaa', marginBottom:'4px' }}>Sala grande</div>
                        <input type="number" value={grande} onChange={e => setGrande(e.target.value)} placeholder="0"
                          style={{ width:'100%', fontSize:'15px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'8px 10px', textAlign:'center' }} />
                      </div>
                      <div>
                        <div style={{ fontSize:'11px', color:'#aaa', marginBottom:'4px' }}>Sala chica</div>
                        <input type="number" value={chica} onChange={e => setChica(e.target.value)} placeholder="0"
                          style={{ width:'100%', fontSize:'15px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'8px 10px', textAlign:'center' }} />
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={() => setEditando(null)} style={{ flex:1, padding:'7px', fontSize:'12px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fff', cursor:'pointer', color:'#888' }}>Cancelar</button>
                      <button onClick={guardar} disabled={saving} style={{ flex:2, padding:'7px', fontSize:'12px', fontWeight:'700', borderRadius:'8px', background:'#185FA5', color:'#fff', border:'none', cursor:'pointer' }}>{saving ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
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
