import { useState, useEffect } from 'react'
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

const DESCANSO_VACIO = { hora: '', min: 0, dur: 0 }
const LINEAS_GRANDE = ['L1','L2','L3','L4']

export default function Produccion({ turnoId, config, onClose }) {
  const [produccion, setProduccion] = useState({})
  const [editando, setEditando] = useState(null)
  // campos de edición
  const [chica, setChica] = useState('')
  const [lineasActivas, setLineasActivas] = useState([])
  const [lineasValores, setLineasValores] = useState({ L1:'', L2:'', L3:'', L4:'' })
  const [saving, setSaving] = useState(false)

  // ingresos
  const [primerIngresoGrande, setPrimerIngresoGrande] = useState('')
  const [primerIngresoChica,  setPrimerIngresoChica]  = useState('')
  const [ultimoIngresoGrande, setUltimoIngresoGrande] = useState('')
  const [ultimoIngresoChica,  setUltimoIngresoChica]  = useState('')

  // descansos arrays
  const [descansosGrande, setDescansosGrande] = useState([{...DESCANSO_VACIO},{...DESCANSO_VACIO}])
  const [descansosChica,  setDescansosChica]  = useState([{...DESCANSO_VACIO},{...DESCANSO_VACIO}])

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
    setter(prev => prev.map((d,i) => i === idx ? {...d, [field]: value} : d))
  }
  function addDescanso(sala) {
    const setter = sala === 'grande' ? setDescansosGrande : setDescansosChica
    setter(prev => [...prev, {...DESCANSO_VACIO}])
  }
  function removeDescanso(sala, idx) {
    const setter = sala === 'grande' ? setDescansosGrande : setDescansosChica
    setter(prev => prev.filter((_,i) => i !== idx))
  }

  function abrirEditar(franja) {
    const prod = produccion[franja]
    setEditando(franja)
    setChica(prod?.chica ?? '')
    // cargar líneas activas y valores
    const activas = prod?.lineas ? Object.keys(prod.lineas) : []
    setLineasActivas(activas)
    setLineasValores({
      L1: prod?.lineas?.L1 ?? '',
      L2: prod?.lineas?.L2 ?? '',
      L3: prod?.lineas?.L3 ?? '',
      L4: prod?.lineas?.L4 ?? '',
    })
  }

  function toggleLinea(l) {
    setLineasActivas(prev =>
      prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]
    )
  }

  // total sala grande = suma de líneas activas con valor
  const totalGrande = lineasActivas.reduce((sum, l) => {
    const v = Number(lineasValores[l])
    return sum + (isNaN(v) ? 0 : v)
  }, 0)

  async function guardar() {
    if (!editando) return
    setSaving(true)
    const franjaId = editando.replace(/:/g,'').replace('-','_')
    const lineasData = {}
    lineasActivas.forEach(l => {
      lineasData[l] = lineasValores[l] === '' ? null : Number(lineasValores[l])
    })
    const data = {
      franja: editando,
      grande: lineasActivas.length > 0 ? totalGrande : null,
      chica:  chica === '' ? null : Number(chica),
      lineas: lineasActivas.length > 0 ? lineasData : null,
      cargadoEn: serverTimestamp()
    }
    await setDoc(doc(db,'turnos',turnoId,'produccion',franjaId), data)
    setProduccion(p => ({...p, [editando]: data}))
    setEditando(null)
    setSaving(false)
  }

  // totales descanso por sala
  const totalDescGrande = descansosGrande.reduce((s,d) => s + (Number(d.dur)||0), 0)
  const totalDescChica  = descansosChica.reduce((s,d)  => s + (Number(d.dur)||0), 0)

  // ── helpers UI ──
  const lbl = t => <div style={{fontSize:'9px',color:'#bbb',fontWeight:'600',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'4px'}}>{t}</div>

  function SectionHeader({ title, open, setOpen, summary, badge }) {
    return (
      <div onClick={() => setOpen(!open)}
        style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',userSelect:'none',padding:'10px 14px',background:open?'#F0F6FF':'#F7F7F5',borderRadius:open?'10px 10px 0 0':'10px',border:`1px solid ${open?'#C8DCF5':'#EFEFED'}`}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span style={{fontSize:'11px',fontWeight:'700',color:open?'#185FA5':'#555',textTransform:'uppercase',letterSpacing:'.07em'}}>{title}</span>
          {!open && summary && <span style={{fontSize:'10px',color:'#185FA5',fontWeight:'600'}}>{summary}</span>}
          {badge && <span style={{fontSize:'9px',padding:'1px 6px',borderRadius:'10px',background:'#f0f6ff',color:'#185FA5',fontWeight:'700'}}>{badge}</span>}
        </div>
        <span style={{fontSize:'9px',color:'#aaa',transform:open?'rotate(180deg)':'none',display:'inline-block',transition:'transform .2s'}}>▼</span>
      </div>
    )
  }

  const innerStyle = {border:'1px solid #C8DCF5',borderTop:'none',borderRadius:'0 0 10px 10px',padding:'12px 14px',background:'#fff',marginBottom:'10px'}

  const resumenPrimer = [primerIngresoGrande&&`G:${primerIngresoGrande}`,primerIngresoChica&&`Ch:${primerIngresoChica}`].filter(Boolean).join(' · ')
  const resumenUltimo = [ultimoIngresoGrande&&`G:${ultimoIngresoGrande}`,ultimoIngresoChica&&`Ch:${ultimoIngresoChica}`].filter(Boolean).join(' · ')
  const descConfigs = descansosGrande.filter(d=>d.hora!=='').length + descansosChica.filter(d=>d.hora!=='').length

  return (
    <>
      <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.25)',zIndex:10,backdropFilter:'blur(2px)'}}/>
      <div style={{fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',position:'fixed',top:0,right:0,bottom:0,width:'440px',background:'#fff',borderLeft:'1px solid #f0f0f0',zIndex:11,display:'flex',flexDirection:'column',boxShadow:'-8px 0 32px rgba(0,0,0,0.1)'}}>

        <div style={{padding:'18px 20px 14px',borderBottom:'1px solid #f0f0f0',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:'18px',fontWeight:'700',color:'#111'}}>Producción</div>
            <button onClick={onClose} style={{width:'32px',height:'32px',borderRadius:'8px',border:'1.5px solid #e8e8e8',background:'#fafafa',cursor:'pointer',fontSize:'18px',color:'#888',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'14px 20px'}}>

          {/* Primer ingreso */}
          <div style={{marginBottom:openPrimer?0:'10px'}}>
            <SectionHeader title="Primer ingreso" open={openPrimer} setOpen={setOpenPrimer} summary={resumenPrimer}/>
            {openPrimer && (
              <div style={innerStyle}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  <div>{lbl('Sala grande')}<input type="time" value={primerIngresoGrande} onChange={e=>setPrimerIngresoGrande(e.target.value)} onBlur={()=>guardarCampo('primerIngresoGrande',primerIngresoGrande)} style={{width:'100%',fontSize:'14px',fontWeight:'600',borderRadius:'8px',border:'1.5px solid #e8e8e8',padding:'6px 8px',background:'#fff',boxSizing:'border-box'}}/></div>
                  <div>{lbl('Sala chica')}<input type="time" value={primerIngresoChica} onChange={e=>setPrimerIngresoChica(e.target.value)} onBlur={()=>guardarCampo('primerIngresoChica',primerIngresoChica)} style={{width:'100%',fontSize:'14px',fontWeight:'600',borderRadius:'8px',border:'1.5px solid #e8e8e8',padding:'6px 8px',background:'#fff',boxSizing:'border-box'}}/></div>
                </div>
              </div>
            )}
          </div>

          {/* Último ingreso */}
          <div style={{marginBottom:openUltimo?0:'10px'}}>
            <SectionHeader title="Último ingreso" open={openUltimo} setOpen={setOpenUltimo} summary={resumenUltimo}/>
            {openUltimo && (
              <div style={innerStyle}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  <div>{lbl('Sala grande')}<input type="time" value={ultimoIngresoGrande} onChange={e=>setUltimoIngresoGrande(e.target.value)} onBlur={()=>guardarCampo('ultimoIngresoGrande',ultimoIngresoGrande)} style={{width:'100%',fontSize:'14px',fontWeight:'600',borderRadius:'8px',border:'1.5px solid #e8e8e8',padding:'6px 8px',background:'#fff',boxSizing:'border-box'}}/></div>
                  <div>{lbl('Sala chica')}<input type="time" value={ultimoIngresoChica} onChange={e=>setUltimoIngresoChica(e.target.value)} onBlur={()=>guardarCampo('ultimoIngresoChica',ultimoIngresoChica)} style={{width:'100%',fontSize:'14px',fontWeight:'600',borderRadius:'8px',border:'1.5px solid #e8e8e8',padding:'6px 8px',background:'#fff',boxSizing:'border-box'}}/></div>
                </div>
              </div>
            )}
          </div>

          {/* Descansos */}
          <div style={{marginBottom:openDescanso?0:'16px'}}>
            <SectionHeader title="Descansos" open={openDescanso} setOpen={setOpenDescanso} badge={descConfigs>0?`${descConfigs} activo${descConfigs>1?'s':''}`:null}/>
            {openDescanso && (
              <div style={innerStyle}>
                {[
                  {label:'Sala grande',descansos:descansosGrande,sala:'grande',total:totalDescGrande},
                  {label:'Sala chica', descansos:descansosChica, sala:'chica', total:totalDescChica},
                ].map(({label,descansos,sala,total})=>(
                  <div key={sala} style={{marginBottom:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px'}}>
                      <span style={{fontSize:'11px',fontWeight:'700',color:'#555'}}>{label}</span>
                      {total > 0 && <span style={{fontSize:'10px',fontWeight:'600',color:'#BA7517',background:'#fff8ee',padding:'2px 8px',borderRadius:'10px',border:'1px solid #F5E6B0'}}>{total} min</span>}
                    </div>
                    {descansos.map((d,idx)=>(
                      <div key={idx} style={{display:'grid',gridTemplateColumns:'2fr 1fr 2fr auto',gap:'6px',alignItems:'flex-end',marginBottom:'6px'}}>
                        <div>{lbl(idx===0?'Hora':'')}<input type="number" value={d.hora} placeholder="ej: 7" onChange={e=>updateDescanso(sala,idx,'hora',e.target.value)} onBlur={guardarDescansos} style={{width:'100%',fontSize:'13px',borderRadius:'8px',border:'1.5px solid #e8e8e8',padding:'6px 8px',boxSizing:'border-box',textAlign:'center'}}/></div>
                        <div>{lbl(idx===0?'Min':'')}<input type="number" value={d.min} placeholder="0" onChange={e=>updateDescanso(sala,idx,'min',e.target.value)} onBlur={guardarDescansos} style={{width:'100%',fontSize:'13px',borderRadius:'8px',border:'1.5px solid #e8e8e8',padding:'6px 8px',boxSizing:'border-box',textAlign:'center'}}/></div>
                        <div>{lbl(idx===0?'Duración (min)':'')}<input type="number" value={d.dur} placeholder="min" onChange={e=>updateDescanso(sala,idx,'dur',e.target.value)} onBlur={guardarDescansos} style={{width:'100%',fontSize:'13px',borderRadius:'8px',border:'1.5px solid #e8e8e8',padding:'6px 8px',boxSizing:'border-box',textAlign:'center'}}/></div>
                        <button onClick={()=>{removeDescanso(sala,idx);setTimeout(guardarDescansos,50)}} style={{width:'28px',height:'32px',borderRadius:'7px',border:'1px solid #fde8e8',background:'#fef9f9',cursor:'pointer',color:'#E24B4A',fontSize:'14px',marginBottom:'1px'}}>×</button>
                      </div>
                    ))}
                    <button onClick={()=>addDescanso(sala)} style={{fontSize:'11px',padding:'5px 12px',borderRadius:'8px',border:'1.5px dashed #b5d4f4',background:'#f0f6ff',color:'#185FA5',cursor:'pointer',fontWeight:'500',width:'100%'}}>+ Agregar descanso</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Franjas */}
          <div style={{fontSize:'10px',fontWeight:'700',color:'#bbb',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:'10px'}}>Franjas horarias</div>

          {franjas.map(franja => {
            const prod      = produccion[franja]
            const esEdit    = editando === franja
            const esPrimera = franja === primeraFranja
            const esUltima  = franja === ultimaFranja
            const tieneLineas = prod?.lineas && Object.keys(prod.lineas).length > 0

            return (
              <div key={franja} style={{marginBottom:'6px',background:esEdit?'#f8fbff':'#fff',border:`1px solid ${esEdit?'#185FA5':'#EFEFED'}`,borderRadius:'10px',padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:esEdit?'12px':'0'}}>
                  <div>
                    <span style={{fontSize:'13px',fontWeight:'600',color:'#333'}}>{franja.replace('-',' — ')}</span>
                    {esPrimera&&(primerIngresoGrande||primerIngresoChica)&&!esEdit&&(
                      <span style={{fontSize:'9px',color:'#185FA5',marginLeft:'8px',fontWeight:'600'}}>▶ G:{primerIngresoGrande||'—'} Ch:{primerIngresoChica||'—'}</span>
                    )}
                    {esUltima&&(ultimoIngresoGrande||ultimoIngresoChica)&&!esEdit&&(
                      <span style={{fontSize:'9px',color:'#BA7517',marginLeft:'8px',fontWeight:'600'}}>⏹ G:{ultimoIngresoGrande||'—'} Ch:{ultimoIngresoChica||'—'}</span>
                    )}
                  </div>
                  {!esEdit && (
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      {prod ? (
                        <div style={{fontSize:'12px'}}>
                          <span style={{color:prod.grande>=objG?'#1D9E75':'#E24B4A',marginRight:'8px'}}>G: <strong>{prod.grande??'—'}</strong></span>
                          {tieneLineas && (
                            <span style={{fontSize:'10px',color:'#aaa'}}>
                              {Object.entries(prod.lineas).map(([l,v])=>`${l}:${v}`).join(' ')}
                            </span>
                          )}
                          <span style={{color:prod.chica>=objC?'#1D9E75':'#E24B4A',marginLeft:'8px'}}>Ch: <strong>{prod.chica??'—'}</strong></span>
                        </div>
                      ):<span style={{fontSize:'11px',color:'#ccc'}}>sin datos</span>}
                      <button onClick={()=>abrirEditar(franja)} style={{fontSize:'11px',padding:'3px 9px',borderRadius:'7px',border:'1px solid #e8e8e8',background:'#fafafa',cursor:'pointer',color:'#555'}}>{prod?'✏️':'+'}</button>
                    </div>
                  )}
                </div>

                {esEdit && (
                  <div>
                    {/* Sala grande — por línea */}
                    <div style={{marginBottom:'12px'}}>
                      <div style={{fontSize:'11px',fontWeight:'700',color:'#555',marginBottom:'8px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <span>Sala grande</span>
                        {lineasActivas.length > 0 && <span style={{fontSize:'12px',fontWeight:'800',color:'#185FA5'}}>Total: {totalGrande}</span>}
                      </div>
                      <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'10px'}}>
                        {LINEAS_GRANDE.map(l=>(
                          <button key={l} onClick={()=>toggleLinea(l)}
                            style={{padding:'4px 12px',fontSize:'12px',borderRadius:'20px',fontWeight:lineasActivas.includes(l)?'700':'400',border:`1.5px solid ${lineasActivas.includes(l)?'#185FA5':'#e8e8e8'}`,background:lineasActivas.includes(l)?'#185FA5':'#fafafa',color:lineasActivas.includes(l)?'#fff':'#888',cursor:'pointer'}}>
                            {l}
                          </button>
                        ))}
                      </div>
                      {lineasActivas.length > 0 && (
                        <div style={{display:'grid',gridTemplateColumns:`repeat(${lineasActivas.length},1fr)`,gap:'8px'}}>
                          {lineasActivas.map(l=>(
                            <div key={l}>
                              <div style={{fontSize:'10px',color:'#aaa',marginBottom:'4px',textAlign:'center',fontWeight:'600'}}>{l}</div>
                              <input type="number" value={lineasValores[l]} placeholder="0"
                                onChange={e=>setLineasValores(p=>({...p,[l]:e.target.value}))}
                                style={{width:'100%',fontSize:'15px',borderRadius:'8px',border:'1.5px solid #185FA5',padding:'8px 6px',textAlign:'center',fontWeight:'700',color:'#185FA5'}}/>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sala chica */}
                    <div style={{marginBottom:'12px'}}>
                      <div style={{fontSize:'11px',fontWeight:'700',color:'#555',marginBottom:'6px'}}>Sala chica (L5)</div>
                      <input type="number" value={chica} onChange={e=>setChica(e.target.value)} placeholder="0"
                        style={{width:'100%',fontSize:'15px',borderRadius:'8px',border:'1.5px solid #e8e8e8',padding:'8px 10px',textAlign:'center'}}/>
                    </div>

                    <div style={{display:'flex',gap:'6px'}}>
                      <button onClick={()=>setEditando(null)} style={{flex:1,padding:'7px',fontSize:'12px',borderRadius:'8px',border:'1px solid #e8e8e8',background:'#fff',cursor:'pointer',color:'#888'}}>Cancelar</button>
                      <button onClick={guardar} disabled={saving} style={{flex:2,padding:'7px',fontSize:'12px',fontWeight:'700',borderRadius:'8px',background:'#185FA5',color:'#fff',border:'none',cursor:'pointer'}}>{saving?'Guardando...':'Guardar'}</button>
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
