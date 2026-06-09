import { useState, useEffect } from 'react'
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

export default function Produccion({ turnoId, config, onClose }) {
  const [produccion, setProduccion] = useState({})
  const [editando, setEditando] = useState(null)
  const [grande, setGrande] = useState('')
  const [chica, setChica] = useState('')
  const [saving, setSaving] = useState(false)

  // ingresos por sala
  const [primerIngresoGrande, setPrimerIngresoGrande] = useState('')
  const [primerIngresoChica,  setPrimerIngresoChica]  = useState('')
  const [ultimoIngresoGrande, setUltimoIngresoGrande] = useState('')
  const [ultimoIngresoChica,  setUltimoIngresoChica]  = useState('')

  // descansos por sala
  const [descGrandeHora, setDescGrandeHora] = useState('')
  const [descGrandeMin,  setDescGrandeMin]  = useState('')
  const [descGrandeDur,  setDescGrandeDur]  = useState('')
  const [descChicaHora,  setDescChicaHora]  = useState('')
  const [descChicaMin,   setDescChicaMin]   = useState('')
  const [descChicaDur,   setDescChicaDur]   = useState('')

  const franjas      = config ? generarFranjas(config) : []
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
      // descansos por sala — si no están en el turno, tomar del config global
      setDescGrandeHora(d.descansoGrandeHora ?? config?.descanso1Hora ?? '')
      setDescGrandeMin (d.descansoGrandeMin  ?? config?.descanso1Min  ?? 0)
      setDescGrandeDur (d.descansoGrandeDur  ?? config?.descanso1Dur  ?? '')
      setDescChicaHora (d.descansoChicaHora  ?? config?.descanso2Hora ?? '')
      setDescChicaMin  (d.descansoChicaMin   ?? config?.descanso2Min  ?? 0)
      setDescChicaDur  (d.descansoChicaDur   ?? config?.descanso2Dur  ?? '')
    })
  }, [turnoId])

  async function guardarCampo(campo, valor) {
    if (valor === '' || valor === undefined) return
    await updateDoc(doc(db,'turnos',turnoId), { [campo]: typeof valor === 'string' ? valor : Number(valor) })
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

  const totalGrande = Object.values(produccion).reduce((a,p) => a + (p.grande || 0), 0)
  const totalChica  = Object.values(produccion).reduce((a,p) => a + (p.chica  || 0), 0)
  const objTotalG   = objG * franjas.length
  const objTotalC   = objC * franjas.length

  const lbl = t => <div style={{ fontSize:'10px', color:'#aaa', fontWeight:'600', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'5px' }}>{t}</div>
  const inputTime = (val, setVal, campo) => (
    <input type="time" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => guardarCampo(campo, val)}
      style={{ width:'100%', fontSize:'13px', fontWeight:'600', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'6px 8px', background:'#fff', boxSizing:'border-box' }} />
  )
  const inputNum = (val, setVal, campo, ph) => (
    <input type="number" value={val} placeholder={ph}
      onChange={e => setVal(e.target.value)}
      onBlur={() => guardarCampo(campo, val)}
      style={{ width:'100%', fontSize:'13px', fontWeight:'600', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'6px 8px', background:'#fff', boxSizing:'border-box', textAlign:'center' }} />
  )

  const sectionTitle = t => (
    <div style={{ fontSize:'11px', fontWeight:'700', color:'#555', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'10px' }}>{t}</div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.25)', zIndex:10, backdropFilter:'blur(2px)' }} />
      <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', position:'fixed', top:0, right:0, bottom:0, width:'440px', background:'#fff', borderLeft:'1px solid #f0f0f0', zIndex:11, display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.1)' }}>

        {/* header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #f0f0f0', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
            <div style={{ fontSize:'18px', fontWeight:'700', color:'#111' }}>Producción</div>
            <button onClick={onClose} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1.5px solid #e8e8e8', background:'#fafafa', cursor:'pointer', fontSize:'18px', color:'#888', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          {/* primer ingreso */}
          <div style={{ background:'#F7F7F5', borderRadius:'12px', padding:'12px 14px', marginBottom:'10px' }}>
            {sectionTitle('Primer ingreso')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div>{lbl('Sala grande')}{inputTime(primerIngresoGrande, setPrimerIngresoGrande, 'primerIngresoGrande')}</div>
              <div>{lbl('Sala chica')}{inputTime(primerIngresoChica, setPrimerIngresoChica, 'primerIngresoChica')}</div>
            </div>
          </div>

          {/* último ingreso */}
          <div style={{ background:'#F7F7F5', borderRadius:'12px', padding:'12px 14px', marginBottom:'10px' }}>
            {sectionTitle('Último ingreso')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div>{lbl('Sala grande')}{inputTime(ultimoIngresoGrande, setUltimoIngresoGrande, 'ultimoIngresoGrande')}</div>
              <div>{lbl('Sala chica')}{inputTime(ultimoIngresoChica, setUltimoIngresoChica, 'ultimoIngresoChica')}</div>
            </div>
          </div>

          {/* descansos por sala */}
          <div style={{ background:'#F7F7F5', borderRadius:'12px', padding:'12px 14px', marginBottom:'14px' }}>
            {sectionTitle('Descansos')}
            {[
              { label:'Sala grande', hora: descGrandeHora, setHora: setDescGrandeHora, campoH:'descansoGrandeHora',
                min: descGrandeMin, setMin: setDescGrandeMin, campoM:'descansoGrandeMin',
                dur: descGrandeDur, setDur: setDescGrandeDur, campoD:'descansoGrandeDur' },
              { label:'Sala chica',  hora: descChicaHora,  setHora: setDescChicaHora,  campoH:'descansoChicaHora',
                min: descChicaMin,  setMin: setDescChicaMin,  campoM:'descansoChicaMin',
                dur: descChicaDur,  setDur: setDescChicaDur,  campoD:'descansoChicaDur' },
            ].map(({ label, hora, setHora, campoH, min, setMin, campoM, dur, setDur, campoD }) => (
              <div key={label} style={{ marginBottom:'10px' }}>
                <div style={{ fontSize:'11px', fontWeight:'600', color:'#888', marginBottom:'6px' }}>{label}</div>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 2fr', gap:'6px' }}>
                  <div>
                    {lbl('Hora')}
                    <input type="number" value={hora} placeholder="7"
                      onChange={e => setHora(e.target.value)}
                      onBlur={() => guardarCampo(campoH, hora)}
                      style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'6px 8px', boxSizing:'border-box', textAlign:'center' }} />
                  </div>
                  <div>
                    {lbl('Min')}
                    <input type="number" value={min} placeholder="30"
                      onChange={e => setMin(e.target.value)}
                      onBlur={() => guardarCampo(campoM, min)}
                      style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'6px 8px', boxSizing:'border-box', textAlign:'center' }} />
                  </div>
                  <div>
                    {lbl('Duración (min)')}
                    <input type="number" value={dur} placeholder="30"
                      onChange={e => setDur(e.target.value)}
                      onBlur={() => guardarCampo(campoD, dur)}
                      style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'6px 8px', boxSizing:'border-box', textAlign:'center' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* totales */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            {[['Sala grande', totalGrande, objTotalG], ['Sala chica', totalChica, objTotalC]].map(([label, total, obj]) => (
              <div key={label} style={{ background:'#F7F7F5', borderRadius:'10px', padding:'10px 12px' }}>
                <div style={{ fontSize:'11px', color:'#aaa', marginBottom:'3px' }}>{label}</div>
                <div style={{ fontSize:'20px', fontWeight:'700', color: total >= obj ? '#1D9E75' : '#E24B4A', lineHeight:1 }}>{total}</div>
                <div style={{ fontSize:'10px', color:'#aaa', marginTop:'2px' }}>obj {obj}</div>
              </div>
            ))}
          </div>
        </div>

        {/* lista de franjas */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 24px' }}>
          {franjas.map(franja => {
            const prod      = produccion[franja]
            const esEdit    = editando === franja
            const esPrimera = franja === primeraFranja
            const esUltima  = franja === ultimaFranja
            return (
              <div key={franja} style={{ marginBottom:'8px', background: esEdit ? '#f8fbff' : '#fff', border:`1px solid ${esEdit ? '#185FA5' : '#EFEFED'}`, borderRadius:'12px', padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: esEdit ? '12px' : '0' }}>
                  <div>
                    <span style={{ fontSize:'13px', fontWeight:'600', color:'#333' }}>{franja.replace('-',' — ')}</span>
                    {esPrimera && (primerIngresoGrande || primerIngresoChica) && !esEdit && (
                      <span style={{ fontSize:'10px', color:'#185FA5', marginLeft:'8px', fontWeight:'600' }}>▶ G:{primerIngresoGrande||'—'} Ch:{primerIngresoChica||'—'}</span>
                    )}
                    {esUltima && (ultimoIngresoGrande || ultimoIngresoChica) && !esEdit && (
                      <span style={{ fontSize:'10px', color:'#BA7517', marginLeft:'8px', fontWeight:'600' }}>⏹ G:{ultimoIngresoGrande||'—'} Ch:{ultimoIngresoChica||'—'}</span>
                    )}
                  </div>
                  {!esEdit && (
                    <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                      {prod ? (
                        <div style={{ display:'flex', gap:'10px', fontSize:'12px' }}>
                          <span style={{ color: prod.grande >= objG ? '#1D9E75' : '#E24B4A' }}>G: <strong>{prod.grande ?? '—'}</strong></span>
                          <span style={{ color: prod.chica  >= objC ? '#1D9E75' : '#E24B4A' }}>Ch: <strong>{prod.chica  ?? '—'}</strong></span>
                        </div>
                      ) : <span style={{ fontSize:'11px', color:'#ccc' }}>sin datos</span>}
                      <button onClick={() => abrirEditar(franja)} style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#555' }}>
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
                      <button onClick={guardar} disabled={saving} style={{ flex:2, padding:'7px', fontSize:'12px', fontWeight:'700', borderRadius:'8px', background:'#185FA5', color:'#fff', border:'none', cursor:'pointer' }}>{saving?'Guardando...':'Guardar'}</button>
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
