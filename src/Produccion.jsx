import { useState, useEffect } from 'react'
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

export default function Produccion({ turnoId, config, onClose }) {
  const [produccion, setProduccion] = useState({})
  const [editando, setEditando] = useState(null)
  const [grande, setGrande] = useState('')
  const [chica, setChica] = useState('')
  const [primerIngreso, setPrimerIngreso] = useState('')
  const [ultimoIngreso, setUltimoIngreso] = useState('')
  const [saving, setSaving] = useState(false)

  const franjas = config ? generarFranjas(config) : []
  const primeraFranja = franjas[0]
  const ultimaFranja = franjas[franjas.length - 1]
  const objG = config?.objetivoGrande || 350
  const objC = config?.objetivoChica || 100

  useEffect(() => {
    if (!turnoId) return
    getDocs(collection(db,'turnos',turnoId,'produccion')).then(snap => {
      const data = {}
      snap.docs.forEach(d => { data[d.data().franja] = d.data() })
      setProduccion(data)
    })
    getDoc(doc(db,'turnos',turnoId)).then(s => {
      if (s.exists()) {
        setPrimerIngreso(s.data().primerIngreso || '')
        setUltimoIngreso(s.data().ultimoIngreso || '')
      }
    })
  }, [turnoId])

  function abrirEditar(franja) {
    setEditando(franja)
    setGrande(produccion[franja]?.grande ?? '')
    setChica(produccion[franja]?.chica ?? '')
  }

  async function guardar() {
    if (!editando) return
    setSaving(true)
    const franjaId = editando.replace(/:/g,'').replace('-','_')
    const data = {
      franja: editando,
      grande: grande === '' ? null : Number(grande),
      chica: chica === '' ? null : Number(chica),
      cargadoEn: serverTimestamp()
    }
    await setDoc(doc(db,'turnos',turnoId,'produccion',franjaId), data)
    setProduccion(p => ({ ...p, [editando]: data }))

    // guardar primer/último ingreso en el turno
    const turnoUpdate = {}
    if (editando === primeraFranja && primerIngreso) turnoUpdate.primerIngreso = primerIngreso
    if (editando === ultimaFranja && ultimoIngreso) turnoUpdate.ultimoIngreso = ultimoIngreso
    if (Object.keys(turnoUpdate).length > 0) {
      await updateDoc(doc(db,'turnos',turnoId), turnoUpdate)
    }

    setEditando(null)
    setSaving(false)
  }

  const totalGrande = Object.values(produccion).reduce((a,p) => a + (p.grande || 0), 0)
  const totalChica  = Object.values(produccion).reduce((a,p) => a + (p.chica  || 0), 0)
  const objTotalG = objG * franjas.length
  const objTotalC = objC * franjas.length

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.25)', zIndex:10, backdropFilter:'blur(2px)' }} />
      <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', position:'fixed', top:0, right:0, bottom:0, width:'400px', background:'#fff', borderLeft:'1px solid #f0f0f0', zIndex:11, display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.1)' }}>

        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #f0f0f0', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:'18px', fontWeight:'700', color:'#111' }}>Producción</div>
            <button onClick={onClose} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1.5px solid #e8e8e8', background:'#fafafa', cursor:'pointer', fontSize:'18px', color:'#888', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          {/* primer / último ingreso */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginTop:'14px' }}>
            <div style={{ background:'#F7F7F5', borderRadius:'10px', padding:'10px 12px' }}>
              <div style={{ fontSize:'10px', color:'#aaa', fontWeight:'600', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'5px' }}>Primer ingreso</div>
              <input type="time" value={primerIngreso} onChange={e => setPrimerIngreso(e.target.value)}
                onBlur={async () => { if (primerIngreso) await updateDoc(doc(db,'turnos',turnoId), { primerIngreso }) }}
                style={{ width:'100%', fontSize:'15px', fontWeight:'700', color:'#111', borderRadius:'7px', border:'1.5px solid #e8e8e8', padding:'5px 8px', background:'#fff' }} />
            </div>
            <div style={{ background:'#F7F7F5', borderRadius:'10px', padding:'10px 12px' }}>
              <div style={{ fontSize:'10px', color:'#aaa', fontWeight:'600', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'5px' }}>Último ingreso</div>
              <input type="time" value={ultimoIngreso} onChange={e => setUltimoIngreso(e.target.value)}
                onBlur={async () => { if (ultimoIngreso) await updateDoc(doc(db,'turnos',turnoId), { ultimoIngreso }) }}
                style={{ width:'100%', fontSize:'15px', fontWeight:'700', color:'#111', borderRadius:'7px', border:'1.5px solid #e8e8e8', padding:'5px 8px', background:'#fff' }} />
            </div>
          </div>

          {/* totales */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginTop:'10px' }}>
            {[['Sala grande', totalGrande, objTotalG], ['Sala chica', totalChica, objTotalC]].map(([label, total, obj]) => (
              <div key={label} style={{ background:'#F7F7F5', borderRadius:'10px', padding:'10px 12px' }}>
                <div style={{ fontSize:'11px', color:'#aaa', marginBottom:'3px' }}>{label}</div>
                <div style={{ fontSize:'20px', fontWeight:'700', color: total >= obj ? '#1D9E75' : '#E24B4A', lineHeight:1 }}>{total}</div>
                <div style={{ fontSize:'10px', color:'#aaa', marginTop:'2px' }}>obj {obj}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 24px' }}>
          {franjas.map(franja => {
            const prod = produccion[franja]
            const esEditando = editando === franja
            const esPrimera = franja === primeraFranja
            const esUltima  = franja === ultimaFranja

            return (
              <div key={franja} style={{ marginBottom:'8px', background: esEditando ? '#f8fbff' : '#fff', border:`1px solid ${esEditando ? '#185FA5' : '#EFEFED'}`, borderRadius:'12px', padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: esEditando ? '12px' : '0' }}>
                  <div>
                    <span style={{ fontSize:'13px', fontWeight:'600', color:'#333' }}>{franja.replace('-',' — ')}</span>
                    {esPrimera && primerIngreso && !esEditando && (
                      <span style={{ fontSize:'10px', color:'#185FA5', marginLeft:'8px', fontWeight:'600' }}>▶ {primerIngreso}</span>
                    )}
                    {esUltima && ultimoIngreso && !esEditando && (
                      <span style={{ fontSize:'10px', color:'#BA7517', marginLeft:'8px', fontWeight:'600' }}>⏹ {ultimoIngreso}</span>
                    )}
                  </div>
                  {!esEditando && (
                    <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                      {prod ? (
                        <div style={{ display:'flex', gap:'10px', fontSize:'12px' }}>
                          <span style={{ color: prod.grande >= objG ? '#1D9E75' : '#E24B4A' }}>G: <strong>{prod.grande ?? '—'}</strong></span>
                          <span style={{ color: prod.chica >= objC ? '#1D9E75' : '#E24B4A' }}>Ch: <strong>{prod.chica ?? '—'}</strong></span>
                        </div>
                      ) : (
                        <span style={{ fontSize:'11px', color:'#ccc' }}>sin datos</span>
                      )}
                      <button onClick={() => abrirEditar(franja)} style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'8px', border:'1px solid #e8e8e8', background:'#fafafa', cursor:'pointer', color:'#555' }}>
                        {prod ? '✏️' : '+'}
                      </button>
                    </div>
                  )}
                </div>

                {esEditando && (
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
