import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from './firebase'
import Drawer from './Drawer'

const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }
const gradoBg = { critico: '#fef2f2', moderado: '#fff8ee', leve: '#f0f6ff', informativo: '#edfbf4' }

export default function Tablero({ user, userData }) {
  const [incidencias, setIncidencias] = useState([])
  const [config, setConfig] = useState(null)
  const [turnoId, setTurnoId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editando, setEditando] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [sectores, setSectores] = useState([])

  useEffect(() => {
    const hoy = new Date()
    const id = hoy.toISOString().slice(0,10).replace(/-/g,'') + '_manana'
    setTurnoId(id)
  }, [])

  useEffect(() => {
    getDoc(doc(db,'config','turno')).then(s => s.exists() && setConfig(s.data()))
    getDoc(doc(db,'config','categorias')).then(s => {
      if (s.exists()) setCategorias(Object.entries(s.data()).map(([id,nombre])=>({id,nombre})).sort((a,b)=>a.nombre.localeCompare(b.nombre)))
    })
    getDoc(doc(db,'config','sectores')).then(s => {
      if (s.exists()) setSectores(Object.values(s.data()).sort())
    })
  }, [])

  useEffect(() => {
    if (!turnoId) return
    const q = query(collection(db,'turnos',turnoId,'incidencias'), orderBy('horaInicio','asc'))
    return onSnapshot(q, snap => setIncidencias(snap.docs.map(d=>({id:d.id,...d.data()}))))
  }, [turnoId])

  const activas = incidencias.filter(i => !i.eliminado)
  const franjas = config ? generarFranjas(config) : []
  const incsPorFranja = franjas.reduce((acc,f) => { acc[f]=activas.filter(i=>i.franja===f); return acc }, {})
  const franjasConInc = franjas.filter(f => incsPorFranja[f].length > 0)
  const ultimaIncId = activas.length > 0 ? activas[activas.length-1].id : null
  const sectoresConInc = sectores.filter(s => activas.some(i => i.sectoresResponsables?.includes(s)))

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', background: '#F7F7F5', minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #EFEFED', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 5 }}>
        <span style={{ fontSize: '16px', fontWeight: '700', color: '#111' }}>Panel de Control</span>
        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: '#EDFBF4', color: '#1D9E75', fontWeight: '600' }}>Turno activo</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#aaa' }}>05:00 — 14:00</span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>Obj: {config ? (config.objetivoGrande + config.objetivoChica) * franjas.length : '...'} ctos</span>
          <button onClick={() => signOut(auth)} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#888' }}>Salir</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: sectoresConInc.length > 0 ? '1fr 280px' : '1fr', gap: '16px', padding: '16px 24px' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              ['Incidencias', activas.length, activas.filter(i=>i.grado==='critico').length + ' críticas', '#E24B4A'],
              ['Tiempo perdido', '— min', 'en paradas', '#BA7517'],
              ['Cuartos producidos', '—', 'de ' + (config ? (config.objetivoGrande + config.objetivoChica) * franjas.length : '...'), '#1D9E75'],
            ].map(([l,v,s,c]) => (
              <div key={l} style={{ background: '#fff', borderRadius: '14px', padding: '14px 16px', border: '1px solid #EFEFED' }}>
                <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '5px', fontWeight: '500' }}>{l}</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: c, lineHeight: 1 }}>{v}</div>
                <div style={{ fontSize: '11px', color: '#bbb', marginTop: '3px' }}>{s}</div>
              </div>
            ))}
          </div>

          <div
            onClick={() => setDrawerOpen('elegir')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#fff', border: '1.5px dashed #d0d0d0', borderRadius: '14px', padding: '16px', cursor: 'pointer', marginBottom: '20px' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#185FA5'; e.currentTarget.style.background='#f8fbff' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#d0d0d0'; e.currentTarget.style.background='#fff' }}>
            <span style={{ fontSize: '24px', fontWeight: '300', color: '#185FA5', lineHeight: 1 }}>+</span>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#185FA5' }}>Registrar incidencia</span>
          </div>

          {franjasConInc.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#ccc', fontSize: '14px' }}>Sin incidencias registradas en el turno</div>
          )}

          {franjasConInc.map(franja => (
            <div key={franja}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', paddingLeft: '2px' }}>
                {franja.replace('-', ' — ')}
              </div>
              {incsPorFranja[franja].map(inc => (
                <IncCard
                  key={inc.id}
                  inc={inc}
                  turnoId={turnoId}
                  userData={userData}
                  onEditar={setEditando}
                  onEliminar={setEliminando}
                  defaultOpen={inc.id === ultimaIncId}
                />
              ))}
            </div>
          ))}
        </div>

        {sectoresConInc.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Con incidencias</div>
            {sectoresConInc.map(s => {
              const incs = activas.filter(i => i.sectoresResponsables?.includes(s))
              const critica = incs.some(i => i.grado === 'critico')
              const moderada = incs.some(i => i.grado === 'moderado')
              const color = critica ? '#E24B4A' : moderada ? '#BA7517' : '#1D9E75'
              return (
                <div key={s} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #EFEFED', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#222' }}>{s}</div>
                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>{incs.length} inc. · {incs.filter(i=>i.grado==='critico').length > 0 ? `${incs.filter(i=>i.grado==='critico').length} crítica` : 'sin críticas'}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {drawerOpen === 'elegir' && (
        <ModalFranja
          franjas={franjas}
          incsPorFranja={incsPorFranja}
          onSelect={f => setDrawerOpen(f)}
          onClose={() => setDrawerOpen(false)}
        />
      )}
      {drawerOpen && drawerOpen !== 'elegir' && (
        <Drawer franja={drawerOpen} turnoId={turnoId} user={user} userData={userData} onClose={() => setDrawerOpen(false)} franjas={franjas} />
      )}
      {editando && (
        <ModalEditar inc={editando} turnoId={turnoId} categorias={categorias} sectores={sectores} userData={userData} onClose={() => setEditando(null)} />
      )}
      {eliminando && userData.rol === 'owner' && (
        <ModalEliminar inc={eliminando} turnoId={turnoId} userData={userData} onClose={() => setEliminando(null)} />
      )}
    </div>
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

function ModalFranja({ franjas, incsPorFranja, onSelect, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '380px', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '24px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#111' }}>¿En qué franja ocurrió?</div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', fontSize: '16px', color: '#888' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}>
          {franjas.map(f => {
            const cant = incsPorFranja[f]?.length || 0
            const label = f.replace('-', ' — ')
            const hActual = new Date().getHours()
            const hFranja = parseInt(f.split(':')[0])
            const esActual = hFranja === hActual
            return (
              <div key={f} onClick={() => onSelect(f)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', border: `1.5px solid ${esActual ? '#185FA5' : '#e8e8e8'}`, background: esActual ? '#f0f6ff' : '#fafafa', cursor: 'pointer' }}
                onMouseEnter={e => { if (!esActual) { e.currentTarget.style.borderColor='#185FA5'; e.currentTarget.style.background='#f8fbff' }}}
                onMouseLeave={e => { if (!esActual) { e.currentTarget.style.borderColor='#e8e8e8'; e.currentTarget.style.background='#fafafa' }}}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: esActual ? '700' : '500', color: esActual ? '#185FA5' : '#333' }}>{label}</span>
                  {esActual && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: '#185FA5', color: '#fff', fontWeight: '600' }}>ahora</span>}
                </div>
                {cant > 0
                  ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#fef2f2', color: '#E24B4A', fontWeight: '600' }}>{cant} inc.</span>
                  : <span style={{ fontSize: '11px', color: '#ccc' }}>sin incidencias</span>
                }
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function IncCard({ inc, turnoId, userData, onEditar, onEliminar, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const [notaEdit, setNotaEdit] = useState(false)
  const [nota, setNota] = useState(inc.notaReunion || '')
  const [finEdit, setFinEdit] = useState(false)
  const [horaFin, setHoraFin] = useState(inc.horaFin || '')
  const [saving, setSaving] = useState(false)

  async function guardarNota() {
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id), {
      notaReunion: nota, notaReunionAutor: userData.nombre, notaReunionEn: serverTimestamp()
    })
    setSaving(false); setNotaEdit(false)
  }

  async function guardarFin() {
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id), { horaFin })
    setSaving(false); setFinEdit(false)
  }

  return (
    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #EFEFED', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background='#FAFAFA'}
        onMouseLeave={e => e.currentTarget.style.background='#fff'}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: gradoColor[inc.grado], flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: '#aaa', fontWeight: '500', minWidth: '38px' }}>{inc.horaInicio}</span>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#111', minWidth: '90px' }}>
          {inc.sala === 'grande' ? 'Grande' : inc.sala === 'chica' ? 'Chica' : 'Ambas'}
          {inc.lineas?.length > 0 ? ' · ' + inc.lineas.join(' ') : ''}
        </span>
        <span style={{ flex: 1, fontSize: '13px', color: '#555' }}>{inc.categoriaNombre}</span>
        <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: gradoBg[inc.grado], color: gradoColor[inc.grado], fontWeight: '600' }}>{inc.grado}</span>
        <span style={{ fontSize: '11px', color: '#ccc', marginLeft: '4px' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid #F5F5F3' }}>
          <div style={{ fontSize: '13px', color: '#666', padding: '10px 0', borderBottom: '1px solid #F5F5F3', lineHeight: '1.5' }}>{inc.descripcion}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', paddingTop: '10px', marginBottom: '10px' }}>
            {[
              ['Responsable', inc.sectoresResponsables?.join(', ') || (inc.causaExterna ? 'Causa externa' : '—')],
              ['Afectado', inc.sectoresAfectados?.join(', ') || '—'],
              ['Inicio · Fin', `${inc.horaInicio} · ${inc.horaFin || 'pendiente'}`],
            ].map(([l,v]) => (
              <div key={l} style={{ background: '#F7F7F5', borderRadius: '8px', padding: '7px 10px' }}>
                <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '2px' }}>{l}</div>
                <div style={{ fontSize: '12px', fontWeight: '500', color: '#333' }}>{v}</div>
              </div>
            ))}
          </div>

          {!inc.horaFin && !finEdit && (
            <button onClick={() => setFinEdit(true)} style={{ fontSize: '11px', color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px', textDecoration: 'underline' }}>+ Registrar hora de fin</button>
          )}
          {finEdit && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} style={{ fontSize: '13px', borderRadius: '8px', border: '1.5px solid #e8e8e8', padding: '6px 10px', width: '120px' }} />
              <button onClick={guardarFin} disabled={saving} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>Guardar</button>
              <button onClick={() => setFinEdit(false)} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888' }}>Cancelar</button>
            </div>
          )}

          {!notaEdit
            ? inc.notaReunion
              ? <div onClick={() => { setNota(inc.notaReunion); setNotaEdit(true) }} style={{ background: '#FFFBF0', border: '1px solid #F5E6B0', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: '#7A6000', fontStyle: 'italic', lineHeight: '1.5', marginBottom: '10px', cursor: 'pointer' }}>{inc.notaReunion}</div>
              : <div onClick={() => setNotaEdit(true)} style={{ border: '1.5px dashed #e8e8e8', borderRadius: '10px', padding: '9px 12px', fontSize: '12px', color: '#bbb', cursor: 'pointer', marginBottom: '10px' }}>+ Agregar nota de reunión...</div>
            : <div style={{ marginBottom: '10px' }}>
                <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Escribí la respuesta acordada..." style={{ width: '100%', fontSize: '13px', minHeight: '60px', resize: 'vertical', borderRadius: '10px', border: '1.5px solid #185FA5', padding: '8px 12px', fontFamily: 'inherit', marginBottom: '6px' }} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={guardarNota} disabled={saving} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '500' }}>{saving ? 'Guardando...' : 'Guardar nota'}</button>
                  <button onClick={() => setNotaEdit(false)} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888' }}>Cancelar</button>
                </div>
              </div>
          }

          <div style={{ display: 'flex', gap: '6px', paddingTop: '8px', borderTop: '1px solid #F5F5F3' }}>
            <button onClick={() => onEditar(inc)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#555', fontWeight: '500' }}>✏️ Editar</button>
            {userData.rol === 'owner' && (
              <button onClick={() => onEliminar(inc)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #fde8e8', background: '#fef9f9', cursor: 'pointer', color: '#E24B4A', fontWeight: '500' }}>🗑 Eliminar</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModalEditar({ inc, turnoId, categorias, sectores, userData, onClose }) {
  const [grado, setGrado] = useState(inc.grado)
  const [descripcion, setDescripcion] = useState(inc.descripcion)
  const [categoria, setCategoria] = useState(inc.categoriaId)
  const [categoriaNombre, setCategoriaNombre] = useState(inc.categoriaNombre)
  const [responsables, setResponsables] = useState(inc.sectoresResponsables || [])
  const [busq, setBusq] = useState('')
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id), {
      grado, descripcion, categoriaId: categoria, categoriaNombre,
      sectoresResponsables: responsables,
      editadoPor: userData.nombre, editadoEn: serverTimestamp()
    })
    setSaving(false); onClose()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '440px', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '24px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#111' }}>Editar incidencia</div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', fontSize: '16px', color: '#888' }}>×</button>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Categoría</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {categorias.map(c => (
              <button key={c.id} onClick={() => { setCategoria(c.id); setCategoriaNombre(c.nombre) }} style={{ padding: '8px', fontSize: '12px', borderRadius: '8px', border: `1.5px solid ${categoria===c.id?'#185FA5':'#e8e8e8'}`, background: categoria===c.id?'#f0f6ff':'#fafafa', color: categoria===c.id?'#185FA5':'#555', cursor: 'pointer', fontWeight: categoria===c.id?'600':'400' }}>{c.nombre}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Grado</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {Object.entries(gradoColor).map(([g,c]) => (
              <button key={g} onClick={() => setGrado(g)} style={{ flex: 1, padding: '8px 4px', fontSize: '11px', fontWeight: grado===g?'700':'400', borderRadius: '8px', border: `1.5px solid ${grado===g?c:'#e8e8e8'}`, background: grado===g?c+'20':'#fafafa', color: grado===g?c:'#888', cursor: 'pointer' }}>{g}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Descripción</div>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} style={{ width: '100%', fontSize: '13px', minHeight: '70px', resize: 'vertical', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '10px 12px', fontFamily: 'inherit' }} />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Responsables</div>
          <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscá un sector..." style={{ width: '100%', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '8px 12px', marginBottom: '6px' }} />
          {busq && (
            <div style={{ border: '1px solid #e8e8e8', borderRadius: '10px', overflow: 'hidden', marginBottom: '6px', maxHeight: '120px', overflowY: 'auto' }}>
              {sectores.filter(s=>s.toLowerCase().includes(busq.toLowerCase())).map(s => (
                <div key={s} onClick={() => { setResponsables(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]); setBusq('') }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: responsables.includes(s)?'#f0f6ff':'#fff', borderBottom: '1px solid #f5f5f5' }}>
                  {responsables.includes(s)?'✓ ':''}{s}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {responsables.map(r => (
              <span key={r} style={{ fontSize: '12px', padding: '3px 10px 3px 12px', borderRadius: '20px', background: '#f0f6ff', color: '#185FA5', border: '1px solid #b5d4f4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {r} <span onClick={() => setResponsables(p=>p.filter(x=>x!==r))} style={{ cursor: 'pointer', opacity: .6 }}>×</span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', fontWeight: '500' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex: 2, padding: '10px', fontSize: '13px', fontWeight: '700', borderRadius: '10px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>{saving?'Guardando...':'Guardar cambios'}</button>
        </div>
      </div>
    </>
  )
}

function ModalEliminar({ inc, turnoId, userData, onClose }) {
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirmar() {
    if (!motivo.trim()) return
    setSaving(true)
    await updateDoc(doc(db,'turnos',turnoId,'incidencias',inc.id), {
      eliminado: true, eliminadoPor: userData.nombre,
      eliminadoEn: serverTimestamp(), motivoEliminacion: motivo
    })
    setSaving(false); onClose()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '400px', background: '#fff', borderRadius: '18px', zIndex: 21, padding: '24px', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: '#111', marginBottom: '6px' }}>Eliminar incidencia</div>
        <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '16px' }}>Esta acción queda registrada. No se puede deshacer.</div>
        <div style={{ background: '#fef2f2', border: '1px solid #fde8e8', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#333' }}>
          <strong>{inc.categoriaNombre}</strong> · {inc.horaInicio} · {inc.grado}
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Motivo <span style={{ color: '#E24B4A' }}>*</span></div>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="¿Por qué se elimina?" style={{ width: '100%', fontSize: '13px', minHeight: '60px', resize: 'vertical', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '8px 12px', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', fontWeight: '500' }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving||!motivo.trim()} style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '700', borderRadius: '10px', background: motivo.trim()?'#E24B4A':'#f5a5a5', color: '#fff', border: 'none', cursor: motivo.trim()?'pointer':'not-allowed' }}>{saving?'Eliminando...':'Confirmar'}</button>
        </div>
      </div>
    </>
  )
}
