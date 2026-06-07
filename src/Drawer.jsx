import { useState, useEffect } from 'react'
import { collection, addDoc, serverTimestamp, getDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
const gradoOpts = [
  { id: 'critico', label: 'Crítico', sub: 'frena producción' },
  { id: 'moderado', label: 'Moderado', sub: 'impacto parcial' },
  { id: 'leve', label: 'Leve', sub: 'impacto menor' },
  { id: 'informativo', label: 'Info', sub: 'sin impacto' },
]

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
  const [errores, setErrores] = useState({})

  useEffect(() => {
    getDoc(doc(db, 'config', 'sectores')).then(snap => {
      if (snap.exists()) setSectores(Object.values(snap.data()).sort())
    })
    getDoc(doc(db, 'config', 'categorias')).then(snap => {
      if (snap.exists()) setCategorias(Object.entries(snap.data()).map(([id, n]) => ({ id, nombre: n })).sort((a, b) => a.nombre.localeCompare(b.nombre)))
    })
    const horaFranjaInicio = franja.split('-')[0]
    setHoraInicio(horaFranjaInicio)
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
    setCategoria(id); setCategoriaNombre(nombre)
    setNuevaCat(''); setMostrarNuevaCat(false)
  }

  function validarPaso2() {
    const e = {}
    if (!categoria) e.categoria = 'Seleccioná una categoría'
    if (!grado) e.grado = 'Seleccioná el grado de la incidencia'
    if (!descripcion.trim()) e.descripcion = 'Describí qué pasó'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  function siguiente() {
    if (step === 2 && !validarPaso2()) return
    setStep(s => s + 1)
  }

  async function guardar() {
    if (!horaInicio) { setErrores({ horaInicio: 'Ingresá la hora de inicio' }); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'turnos', turnoId, 'incidencias'), {
        franja, horaInicio, horaFin: horaFin || null,
        sala, lineas, sectoresAfectados: afectados,
        sectoresResponsables: responsables, causaExterna,
        categoriaId: categoria, categoriaNombre, grado, descripcion, etiquetas,
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
    setDescripcion(''); setEtiquetas([]); setErrores({})
  }

  const chip = (label, active, color, onClick) => (
    <button onClick={onClick} style={{ padding: '6px 14px', fontSize: '12px', fontWeight: active ? '500' : '400', borderRadius: '20px', border: `1.5px solid ${active ? color : '#e8e8e8'}`, background: active ? color + '15' : '#fff', color: active ? color : '#888', cursor: 'pointer', transition: 'all .15s' }}>{label}</button>
  )

  function BuscadorSector({ busq, setBusq, seleccionados, toggle, placeholder }) {
    const filtrados = sectores.filter(s => s.toLowerCase().includes(busq.toLowerCase()))
    return (
      <div>
        <div style={{ position: 'relative' }}>
          <input value={busq} onChange={e => setBusq(e.target.value)} placeholder={placeholder} style={{ width: '100%', fontSize: '13px', padding: '9px 12px', borderRadius: '10px', border: '1.5px solid #e8e8e8', outline: 'none', background: '#fafafa' }} />
          {busq && <span onClick={() => setBusq('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#bbb', fontSize: '16px' }}>×</span>}
        </div>
        {busq && filtrados.length > 0 && (
          <div style={{ border: '1.5px solid #e8e8e8', borderRadius: '10px', overflow: 'hidden', marginTop: '6px', maxHeight: '160px', overflowY: 'auto', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
            {filtrados.map(s => (
              <div key={s} onClick={() => { toggle(s); setBusq('') }} style={{ padding: '9px 14px', fontSize: '13px', cursor: 'pointer', background: seleccionados.includes(s) ? '#f0f6ff' : '#fff', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${seleccionados.includes(s) ? '#185FA5' : '#ddd'}`, background: seleccionados.includes(s) ? '#185FA5' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {seleccionados.includes(s) && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
                </div>
                {s}
              </div>
            ))}
          </div>
        )}
        {seleccionados.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
            {seleccionados.map(r => (
              <span key={r} style={{ fontSize: '12px', padding: '4px 10px 4px 12px', borderRadius: '20px', background: '#f0f6ff', color: '#185FA5', border: '1.5px solid #b5d4f4', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {r} <span onClick={() => toggle(r)} style={{ cursor: 'pointer', opacity: .6, fontSize: '14px' }}>×</span>
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  const sectionTitle = (t) => <div style={{ fontSize: '11px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>{t}</div>
  const fieldLabel = (t, req, opt) => <div style={{ fontSize: '13px', fontWeight: '500', color: '#333', marginBottom: '8px' }}>{t}{req && <span style={{ color: '#E24B4A', marginLeft: '3px' }}>*</span>}{opt && <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400', marginLeft: '6px' }}>opcional</span>}</div>
  const errorMsg = (key) => errores[key] ? <div style={{ fontSize: '11px', color: '#E24B4A', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>⚠ {errores[key]}</div> : null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 10, backdropFilter: 'blur(2px)' }} />
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', position: 'fixed', top: 0, right: 0, bottom: 0, width: '380px', background: '#fff', borderLeft: '1px solid #f0f0f0', zIndex: 11, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.1)' }}>

        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#111', marginBottom: '3px' }}>Nueva incidencia</div>
              <div style={{ fontSize: '13px', color: '#999' }}>Franja {franja.replace('-', ' — ')}</div>
            </div>
            <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1.5px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', fontSize: '18px', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          {!done && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px', gap: '0' }}>
              {['¿Dónde?', '¿Qué pasó?', '¿Cuánto?'].map((lbl, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '600', background: step === i+1 ? '#185FA5' : step > i+1 ? '#1D9E75' : '#f0f0f0', color: step >= i+1 ? '#fff' : '#aaa', marginBottom: '4px' }}>
                      {step > i+1 ? '✓' : i+1}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: step === i+1 ? '600' : '400', color: step === i+1 ? '#185FA5' : step > i+1 ? '#1D9E75' : '#bbb' }}>{lbl}</div>
                  </div>
                  {i < 2 && <div style={{ height: '1.5px', width: '24px', background: step > i+1 ? '#1D9E75' : '#e8e8e8', marginBottom: '14px', flexShrink: 0 }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#e8f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px' }}>✓</div>
              <div style={{ fontSize: '17px', fontWeight: '600', color: '#111', marginBottom: '6px' }}>¡Incidencia registrada!</div>
              <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>{categoriaNombre}</div>
              <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '28px' }}>{sala === 'grande' ? 'Sala grande' : sala === 'chica' ? 'Sala chica' : 'Ambas salas'}{lineas.length > 0 ? ' · ' + lineas.join(', ') : ''}</div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button onClick={reset} style={{ fontSize: '13px', padding: '9px 18px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', fontWeight: '500' }}>+ Nueva</button>
                <button onClick={onClose} style={{ fontSize: '13px', padding: '9px 18px', borderRadius: '10px', border: 'none', background: '#185FA5', color: '#fff', cursor: 'pointer', fontWeight: '500' }}>Volver al tablero</button>
              </div>
            </div>

          ) : step === 1 ? (
            <div>
              <div style={{ marginBottom: '20px' }}>
                {fieldLabel('Sala', true)}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['grande', 'chica', 'ambas'].map(s => (
                    <button key={s} onClick={() => setSala(s)} style={{ flex: 1, padding: '10px 0', fontSize: '13px', fontWeight: sala === s ? '600' : '400', borderRadius: '10px', border: `1.5px solid ${sala === s ? '#185FA5' : '#e8e8e8'}`, background: sala === s ? '#185FA5' : '#fafafa', color: sala === s ? '#fff' : '#666', cursor: 'pointer' }}>
                      {s === 'grande' ? 'Grande' : s === 'chica' ? 'Chica' : 'Ambas'}
                    </button>
                  ))}
                </div>
              </div>

              {sala !== 'chica' && (
                <div style={{ marginBottom: '20px' }}>
                  {fieldLabel('Líneas afectadas', false, true)}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['L2', 'L3', 'L4', 'L5'].map(l => chip(l, lineas.includes(l), '#BA7517', () => toggleLinea(l)))}
                  </div>
                </div>
              )}

              <div style={{ background: '#fafafa', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                {sectionTitle('Sectores afectados')}
                {fieldLabel('¿Dónde impactó?', false, true)}
                <BuscadorSector busq={busqAfect} setBusq={setBusqAfect} seleccionados={afectados} toggle={toggleAfect} placeholder="Buscá un sector..." />
              </div>

              <div style={{ background: '#fafafa', borderRadius: '12px', padding: '16px' }}>
                {sectionTitle('Sector responsable')}
                {fieldLabel('¿Quién resuelve?', false, true)}
                <BuscadorSector busq={busqResp} setBusq={setBusqResp} seleccionados={responsables} toggle={toggleResp} placeholder="Buscá un sector..." />
                <button onClick={() => setCausaExterna(!causaExterna)} style={{ marginTop: '10px', fontSize: '12px', padding: '6px 14px', borderRadius: '20px', border: `1.5px ${causaExterna ? 'solid' : 'dashed'} ${causaExterna ? '#185FA5' : '#ddd'}`, background: causaExterna ? '#f0f6ff' : '#fff', color: causaExterna ? '#185FA5' : '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  🌐 Causa externa
                </button>
              </div>
            </div>

          ) : step === 2 ? (
            <div>
              <div style={{ marginBottom: '20px' }}>
                {fieldLabel('Categoría', true)}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  {categorias.map(c => (
                    <button key={c.id} onClick={() => { setCategoria(c.id); setCategoriaNombre(c.nombre); setErrores(e => ({...e, categoria: null})) }} style={{ padding: '10px 8px', fontSize: '12px', borderRadius: '10px', border: `1.5px solid ${categoria === c.id ? '#185FA5' : '#e8e8e8'}`, background: categoria === c.id ? '#f0f6ff' : '#fafafa', color: categoria === c.id ? '#185FA5' : '#555', cursor: 'pointer', fontWeight: categoria === c.id ? '600' : '400', lineHeight: '1.3', textAlign: 'center' }}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
                {errorMsg('categoria')}
                {!mostrarNuevaCat ? (
                  <button onClick={() => setMostrarNuevaCat(true)} style={{ fontSize: '12px', padding: '7px 14px', borderRadius: '20px', border: '1.5px dashed #b5d4f4', background: '#f0f6ff', color: '#185FA5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    + Agregar categoría nueva
                  </button>
                ) : (
                  <div style={{ background: '#f5f8ff', borderRadius: '12px', padding: '12px', border: '1.5px solid #dce8f5' }}>
                    <input value={nuevaCat} onChange={e => setNuevaCat(e.target.value)} placeholder="Nombre de la categoría..." style={{ width: '100%', fontSize: '13px', marginBottom: '8px', borderRadius: '8px', border: '1.5px solid #e8e8e8', padding: '8px 12px' }} />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={agregarCategoria} style={{ flex: 1, fontSize: '12px', padding: '7px', borderRadius: '8px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '500' }}>Agregar y usar</button>
                      <button onClick={() => setMostrarNuevaCat(false)} style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '8px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888' }}>Cancelar</button>
                    </div>
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '6px' }}>Queda disponible para todos al instante · se registra quién la creó</div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                {fieldLabel('Grado de incidencia', true)}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {gradoOpts.map(g => (
                    <button key={g.id} onClick={() => { setGrado(g.id); setErrores(e => ({...e, grado: null})) }} style={{ padding: '10px 8px', fontSize: '12px', fontWeight: grado === g.id ? '600' : '400', borderRadius: '10px', border: `1.5px solid ${grado === g.id ? gradoColor[g.id] : '#e8e8e8'}`, background: grado === g.id ? gradoColor[g.id] + '15' : '#fafafa', color: grado === g.id ? gradoColor[g.id] : '#666', cursor: 'pointer', lineHeight: '1.4', textAlign: 'center' }}>
                      {g.label}<br /><span style={{ fontSize: '10px', fontWeight: '400', opacity: .8 }}>{g.sub}</span>
                    </button>
                  ))}
                </div>
                {errorMsg('grado')}
              </div>

              <div style={{ marginBottom: '20px' }}>
                {fieldLabel('¿Qué pasó?', true)}
                <textarea value={descripcion} onChange={e => { setDescripcion(e.target.value); setErrores(ex => ({...ex, descripcion: null})) }} placeholder="Describí brevemente qué ocurrió..." style={{ width: '100%', fontSize: '13px', minHeight: '80px', resize: 'vertical', borderRadius: '10px', border: `1.5px solid ${errores.descripcion ? '#E24B4A' : '#e8e8e8'}`, padding: '10px 12px', fontFamily: 'inherit', background: '#fafafa' }} />
                {errorMsg('descripcion')}
              </div>

              <div>
                {fieldLabel('Etiquetas', false, true)}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Escribí y presioná Enter..." style={{ flex: 1, fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '8px 12px', background: '#fafafa' }} />
                  <button onClick={addTag} style={{ fontSize: '12px', padding: '8px 14px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#555', fontWeight: '500' }}>+ Add</button>
                </div>
                {etiquetas.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {etiquetas.map((t, i) => (
                      <span key={i} style={{ fontSize: '12px', padding: '4px 10px 4px 12px', borderRadius: '20px', background: '#f5f5f5', border: '1.5px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: '4px', color: '#555' }}>
                        {t} <span onClick={() => setEtiquetas(p => p.filter((_, j) => j !== i))} style={{ cursor: 'pointer', opacity: .5, fontSize: '14px' }}>×</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

          ) : (
            <div>
              <div style={{ marginBottom: '20px' }}>
                {fieldLabel('Horario', true)}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>Inicio *</div>
                    <input type="time" value={horaInicio} onChange={e => { setHoraInicio(e.target.value); setErrores(ex => ({...ex, horaInicio: null})) }} style={{ width: '100%', fontSize: '14px', borderRadius: '10px', border: `1.5px solid ${errores.horaInicio ? '#E24B4A' : '#e8e8e8'}`, padding: '9px 12px' }} />
                  </div>
                  <div style={{ color: '#ddd', marginTop: '18px' }}>—</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>Fin <span style={{ color: '#aaa' }}>opcional</span></div>
                    <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} style={{ width: '100%', fontSize: '14px', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '9px 12px' }} />
                  </div>
                </div>
                {errorMsg('horaInicio')}
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>Si no sabés el fin, lo completás después desde el tablero</div>
              </div>

              <div style={{ background: '#fafafa', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1.5px solid #f0f0f0' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>Resumen</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    ['Sala', `${sala === 'grande' ? 'Grande' : sala === 'chica' ? 'Chica' : 'Ambas'}${lineas.length > 0 ? ' · ' + lineas.join(' ') : ''}`],
                    ['Categoría', categoriaNombre],
                    ['Grado', grado, gradoColor[grado]],
                    ['Responsable', responsables.length > 0 ? responsables.join(', ') : causaExterna ? 'Causa externa' : '—'],
                  ].map(([l, v, c]) => (
                    <div key={l}>
                      <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '2px' }}>{l}</div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: c || '#111' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={guardar} disabled={saving} style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: '600', borderRadius: '12px', background: saving ? '#aaa' : '#185FA5', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', marginBottom: '8px' }}>
                {saving ? 'Guardando...' : 'Registrar incidencia'}
              </button>
              <button onClick={() => setStep(2)} style={{ width: '100%', padding: '10px', fontSize: '13px', borderRadius: '12px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888' }}>← Editar</button>
            </div>
          )}
        </div>

        {!done && step < 3 && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', flexShrink: 0, background: '#fff' }}>
            <button onClick={() => step > 1 && setStep(step - 1)} style={{ fontSize: '13px', padding: '9px 18px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', visibility: step > 1 ? 'visible' : 'hidden', fontWeight: '500' }}>← Volver</button>
            <button onClick={siguiente} style={{ fontSize: '13px', padding: '9px 22px', borderRadius: '10px', border: 'none', background: '#185FA5', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Siguiente →</button>
          </div>
        )}
      </div>
    </>
  )
}
