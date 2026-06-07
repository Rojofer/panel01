import { useState, useEffect } from 'react'
import { collection, addDoc, serverTimestamp, getDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from './firebase'

export default function Drawer({ franja, turnoId, user, userData, onClose }) {
  const [step, setStep] = useState(1)
  const [sectores, setSectores] = useState([])
  const [categorias, setCategorias] = useState([])
  const [sala, setSala] = useState('grande')
  const [lineas, setLineas] = useState([])
  const [afectados, setAfectados] = useState([])
  const [responsables, setResponsables] = useState([])
  const [causaExterna, setCausaExterna] = useState(false)
  const [categoria, setCategoria] = useState('')
  const [categoriaNombre, setCategoriaNombre] = useState('')
  const [nuevaCat, setNuevaCat] = useState('')
  const [mostrarNuevaCat, setMostrarNuevaCat] = useState(false)
  const [grado, setGrado] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [etiquetas, setEtiquetas] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [busqAfect, setBusqAfect] = useState('')
  const [busqResp, setBusqResp] = useState('')

  useEffect(() => {
    getDoc(doc(db, 'config', 'sectores')).then(snap => {
      if (snap.exists()) setSectores(Object.values(snap.data()).sort())
    })
    getDoc(doc(db, 'config', 'categorias')).then(snap => {
      if (snap.exists()) {
        setCategorias(Object.entries(snap.data()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)))
      }
    })
    const now = new Date()
    setHoraInicio(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
  }, [])

  function toggleAfect(s) { setAfectados(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]) }
  function toggleResp(s) { setResponsables(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]) }
  function toggleLinea(l) { setLineas(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l]) }
  function addTag() { if (!tagInput.trim()) return; setEtiquetas(p => [...p, tagInput.trim()]); setTagInput('') }

  async function agregarCategoria() {
    if (!nuevaCat.trim()) return
    const id = 'c' + Date.now()
    const nombre = nuevaCat.trim()
    await updateDoc(doc(db, 'config', 'categorias'), { [id]: nombre })
    setCategorias(p => [...p, { id, nombre }].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setCategoria(id)
    setCategoriaNombre(nombre)
    setNuevaCat('')
    setMostrarNuevaCat(false)
  }

  async function guardar() {
    if (!categoria || !grado || !descripcion || !horaInicio) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'turnos', turnoId, 'incidencias'), {
        franja, horaInicio, horaFin: horaFin || null,
        sala, lineas, sectoresAfectados: afectados,
        sectoresResponsables: responsables, causaExterna,
        categoriaId: categoria, categoriaNombre, grado,
        descripcion, etiquetas,
        notaReunion: null, notaReunionAutor: null, notaReunionEn: null,
        creadoPor: user.uid, creadoPorNombre: userData.nombre,
        creadoEn: serverTimestamp(), editadoPor: null, editadoEn: null, eliminado: false,
      })
      setDone(true)
    } catch (e) { alert('Error: ' + e.message) }
    setSaving(false)
  }

  function reset() {
    setDone(false); setStep(1); setSala('grande'); setLineas([])
    setAfectados([]); setResponsables([]); setCausaExterna(false)
    setCategoria(''); setCategoriaNombre(''); setGrado('')
    setDescripcion(''); setEtiquetas([])
  }

  const gradoOpts = [
    { id: 'critico', label: 'Crítico', sub: 'frena prod.' },
    { id: 'moderado', label: 'Moderado', sub: 'parcial' },
    { id: 'leve', label: 'Leve', sub: 'menor' },
    { id: 'informativo', label: 'Info', sub: 'sin impacto' },
  ]
  const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }

  const S = { fontFamily: 'sans-serif', fontSize: '13px' }
  const label = (t, req, opt) => (
    <div style={{ fontSize: '11px', fontWeight: '500', color: '#666', marginBottom: '5px' }}>
      {t} {req && <span style={{ color: '#E24B4A' }}>*</span>} {opt && <span style={{ fontSize: '9px', color: '#999', fontWeight: '400' }}>opcional</span>}
    </div>
  )

  function BuscadorSector({ busq, setBusq, seleccionados, toggle, placeholder }) {
    const filtrados = sectores.filter(s => s.toLowerCase().includes(busq.toLowerCase()))
    return (
      <div>
        <input value={busq} onChange={e => setBusq(e.target.value)} placeholder={placeholder} style={{ width: '100%', fontSize: '12px', marginBottom: '5px' }} />
        {busq && filtrados.length > 0 && (
          <div style={{ border: '0.5px solid #e5e5e5', borderRadius: '8px', overflow: 'hidden', marginBottom: '5px', maxHeight: '140px', overflowY: 'auto' }}>
            {filtrados.map(s => (
              <div key={s} onClick={() => { toggle(s); setBusq('') }} style={{ padding: '6px 10px', fontSize: '12px', cursor: 'pointer', background: seleccionados.includes(s) ? '#e6f1fb' : '#fff', borderBottom: '0.5px solid #f5f5f5' }}>
                {seleccionados.includes(s) ? '✓ ' : ''}{s}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {seleccionados.map(r => (
            <span key={r} style={{ fontSize: '11px', padding: '2px 8px 2px 10px', borderRadius: '20px', background: '#e6f1fb', color: '#185FA5', border: '0.5px solid #b5d4f4', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {r} <span onClick={() => toggle(r)} style={{ cursor: 'pointer', opacity: .7 }}>×</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10 }} />
      <div style={{ ...S, position: 'fixed', top: 0, right: 0, bottom: 0, width: '320px', background: '#fff', borderLeft: '0.5px solid #e5e5e5', zIndex: 11, display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '0.5px solid #f0f0f0', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '500' }}>Cargar incidencia</div>
            <div style={{ fontSize: '10px', color: '#999', marginTop: '1px' }}>Franja {franja.replace('-', ' — ')}</div>
          </div>
          <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '0.5px solid #e5e5e5', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#888' }}>×</button>
        </div>

        {!done && (
          <div style={{ display: 'flex', padding: '10px 14px 4px', flexShrink: 0 }}>
            {['¿Dónde?', '¿Qué pasó?', '¿Cuánto?'].map((lbl, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', margin: '0 auto 3px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '500', background: step === i+1 ? '#e6f1fb' : step > i+1 ? '#e8f5ee' : '#f5f5f5', color: step === i+1 ? '#185FA5' : step > i+1 ? '#1D9E75' : '#aaa', border: `0.5px solid ${step === i+1 ? '#185FA5' : step > i+1 ? '#1D9E75' : '#e5e5e5'}` }}>{step > i+1 ? '✓' : i+1}</div>
                <div style={{ fontSize: '9px', color: step === i+1 ? '#185FA5' : step > i+1 ? '#1D9E75' : '#aaa', fontWeight: step === i+1 ? '500' : '400' }}>{lbl}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '32px', color: '#1D9E75', marginBottom: '8px' }}>✓</div>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Incidencia registrada</div>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '16px' }}>{categoriaNombre} · {sala === 'grande' ? 'Grande' : sala === 'chica' ? 'Chica' : 'Ambas'}</div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                <button onClick={reset} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'none', cursor: 'pointer' }}>+ Nueva</button>
                <button onClick={onClose} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: '0.5px solid #185FA5', background: '#e6f1fb', color: '#185FA5', cursor: 'pointer' }}>Volver</button>
              </div>
            </div>

          ) : step === 1 ? (
            <div>
              <div style={{ marginBottom: '12px' }}>
                {label('Sala', true)}
                <div style={{ display: 'flex', gap: '5px' }}>
                  {['grande', 'chica', 'ambas'].map(s => (
                    <button key={s} onClick={() => setSala(s)} style={{ flex: 1, padding: '6px 0', fontSize: '11px', fontWeight: '500', borderRadius: '8px', border: `0.5px solid ${sala === s ? '#185FA5' : '#e5e5e5'}`, background: sala === s ? '#e6f1fb' : '#fff', color: sala === s ? '#185FA5' : '#888', cursor: 'pointer' }}>
                      {s === 'grande' ? 'Grande' : s === 'chica' ? 'Chica' : 'Ambas'}
                    </button>
                  ))}
                </div>
              </div>

              {sala !== 'chica' && (
                <div style={{ marginBottom: '12px' }}>
                  {label('Líneas', false, true)}
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {['L2', 'L3', 'L4', 'L5'].map(l => (
                      <button key={l} onClick={() => toggleLinea(l)} style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '500', borderRadius: '8px', border: `0.5px solid ${lineas.includes(l) ? '#BA7517' : '#e5e5e5'}`, background: lineas.includes(l) ? '#fff8ee' : '#fff', color: lineas.includes(l) ? '#BA7517' : '#888', cursor: 'pointer' }}>{l}</button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ borderTop: '0.5px solid #f0f0f0', paddingTop: '12px', marginBottom: '12px' }}>
                {label('Sectores afectados', false, true)}
                <BuscadorSector busq={busqAfect} setBusq={setBusqAfect} seleccionados={afectados} toggle={toggleAfect} placeholder="¿Dónde impactó? Buscá..." />
              </div>

              <div style={{ borderTop: '0.5px solid #f0f0f0', paddingTop: '12px' }}>
                {label('Sectores responsables', false, true)}
                <BuscadorSector busq={busqResp} setBusq={setBusqResp} seleccionados={responsables} toggle={toggleResp} placeholder="¿Quién resuelve? Buscá..." />
                <button onClick={() => setCausaExterna(!causaExterna)} style={{ marginTop: '8px', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: `0.5px ${causaExterna ? 'solid' : 'dashed'} #ddd`, background: causaExterna ? '#f5f5f5' : 'none', color: causaExterna ? '#555' : '#999', cursor: 'pointer' }}>
                  🌐 Causa externa
                </button>
              </div>
            </div>

          ) : step === 2 ? (
            <div>
              <div style={{ marginBottom: '12px' }}>
                {label('Categoría', true)}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '6px' }}>
                  {categorias.map(c => (
                    <button key={c.id} onClick={() => { setCategoria(c.id); setCategoriaNombre(c.nombre) }} style={{ padding: '7px 6px', fontSize: '11px', borderRadius: '8px', border: `0.5px solid ${categoria === c.id ? '#185FA5' : '#e5e5e5'}`, background: categoria === c.id ? '#e6f1fb' : '#fff', color: categoria === c.id ? '#185FA5' : '#666', cursor: 'pointer', fontWeight: categoria === c.id ? '500' : '400', lineHeight: '1.3', textAlign: 'center' }}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
                {!mostrarNuevaCat ? (
                  <button onClick={() => setMostrarNuevaCat(true)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '20px', border: '0.5px dashed #b5d4f4', background: '#f0f6ff', color: '#185FA5', cursor: 'pointer' }}>
                    + Agregar categoría nueva
                  </button>
                ) : (
                  <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '8px', marginTop: '4px' }}>
                    <input value={nuevaCat} onChange={e => setNuevaCat(e.target.value)} placeholder="Nombre de la categoría..." style={{ width: '100%', fontSize: '12px', marginBottom: '6px' }} />
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={agregarCategoria} style={{ flex: 1, fontSize: '11px', padding: '5px', borderRadius: '6px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>Agregar y usar</button>
                      <button onClick={() => setMostrarNuevaCat(false)} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '0.5px solid #ddd', background: '#fff', cursor: 'pointer', color: '#888' }}>Cancelar</button>
                    </div>
                    <div style={{ fontSize: '10px', color: '#999', marginTop: '5px' }}>Queda disponible para todos al instante</div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '12px' }}>
                {label('Grado', true)}
                <div style={{ display: 'flex', gap: '5px' }}>
                  {gradoOpts.map(g => (
                    <button key={g.id} onClick={() => setGrado(g.id)} style={{ flex: 1, padding: '7px 2px', fontSize: '11px', fontWeight: '500', borderRadius: '8px', border: `0.5px solid ${grado === g.id ? gradoColor[g.id] : '#e5e5e5'}`, background: grado === g.id ? gradoColor[g.id] + '22' : '#fff', color: grado === g.id ? gradoColor[g.id] : '#888', cursor: 'pointer', lineHeight: '1.3' }}>
                      {g.label}<br /><span style={{ fontSize: '9px', fontWeight: '400', opacity: .8 }}>{g.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                {label('¿Qué pasó?', true)}
                <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Describí brevemente..." style={{ width: '100%', fontSize: '12px', minHeight: '64px', resize: 'vertical' }} />
              </div>

              <div>
                {label('Etiquetas', false, true)}
                <div style={{ display: 'flex', gap: '5px' }}>
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Escribí y presioná Enter..." style={{ flex: 1, fontSize: '12px' }} />
                  <button onClick={addTag} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '0.5px solid #ddd', background: '#f5f5f5', cursor: 'pointer' }}>+ Add</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                  {etiquetas.map((t, i) => (
                    <span key={i} style={{ fontSize: '10px', padding: '2px 8px 2px 10px', borderRadius: '20px', background: '#f5f5f5', border: '0.5px solid #e5e5e5', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {t} <span onClick={() => setEtiquetas(p => p.filter((_, j) => j !== i))} style={{ cursor: 'pointer', opacity: .6 }}>×</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

          ) : (
            <div>
              <div style={{ marginBottom: '12px' }}>
                {label('Hora de inicio', true)}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} style={{ fontSize: '13px', width: '100px' }} />
                  <span style={{ color: '#ccc' }}>—</span>
                  <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} style={{ fontSize: '13px', width: '100px' }} />
                  <span style={{ fontSize: '10px', color: '#aaa', fontStyle: 'italic' }}>fin opcional</span>
                </div>
                <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px' }}>Si no sabés el fin, lo completás después desde el tablero</div>
              </div>

              <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '10px', marginBottom: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div><div style={{ fontSize: '10px', color: '#999' }}>Sala</div><div style={{ fontSize: '12px', fontWeight: '500' }}>{sala === 'grande' ? 'Grande' : sala === 'chica' ? 'Chica' : 'Ambas'}{lineas.length > 0 ? ' · ' + lineas.join(' ') : ''}</div></div>
                  <div><div style={{ fontSize: '10px', color: '#999' }}>Categoría</div><div style={{ fontSize: '12px', fontWeight: '500' }}>{categoriaNombre}</div></div>
                  <div><div style={{ fontSize: '10px', color: '#999' }}>Grado</div><div style={{ fontSize: '12px', fontWeight: '500', color: gradoColor[grado] }}>{grado}</div></div>
                  <div><div style={{ fontSize: '10px', color: '#999' }}>Responsables</div><div style={{ fontSize: '12px', fontWeight: '500' }}>{responsables.length > 0 ? responsables.join(', ') : causaExterna ? 'Causa externa' : '—'}</div></div>
                </div>
              </div>

              <button onClick={guardar} disabled={saving || !horaInicio || !categoria || !grado || !descripcion} style={{ width: '100%', padding: '9px', fontSize: '13px', fontWeight: '500', borderRadius: '8px', background: '#185FA5', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: (saving || !horaInicio || !categoria || !grado || !descripcion) ? 0.5 : 1, marginBottom: '6px' }}>
                {saving ? 'Guardando...' : 'Registrar incidencia'}
              </button>
              <button onClick={() => setStep(2)} style={{ width: '100%', padding: '7px', fontSize: '12px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'none', cursor: 'pointer', color: '#888' }}>← Editar</button>
            </div>
          )}
        </div>

        {!done && step < 3 && (
          <div style={{ padding: '10px 14px', borderTop: '0.5px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
            <button onClick={() => step > 1 && setStep(step - 1)} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '8px', border: '0.5px solid #e5e5e5', background: 'none', cursor: 'pointer', color: '#888', visibility: step > 1 ? 'visible' : 'hidden' }}>← Volver</button>
            <button onClick={() => setStep(step + 1)} style={{ fontSize: '12px', padding: '7px 18px', borderRadius: '8px', border: '0.5px solid #185FA5', background: '#e6f1fb', color: '#185FA5', cursor: 'pointer', fontWeight: '500' }}>Siguiente →</button>
          </div>
        )}
      </div>
    </>
  )
}
