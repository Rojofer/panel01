import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from './firebase'
import Drawer from './Drawer'

const gradoColor = { critico: '#E24B4A', moderado: '#BA7517', leve: '#185FA5', informativo: '#1D9E75' }

export default function Tablero({ user, userData }) {
  const [incidencias, setIncidencias] = useState([])
  const [config, setConfig] = useState(null)
  const [turnoId, setTurnoId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [franjaDrawer, setFranjaDrawer] = useState('')
  const [editando, setEditando] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [sectores, setSectores] = useState([])

  useEffect(() => {
    const hoy = new Date()
    const id = hoy.toISOString().slice(0, 10).replace(/-/g, '') + '_manana'
    setTurnoId(id)
  }, [])

  useEffect(() => {
    getDoc(doc(db, 'config', 'turno')).then(s => s.exists() && setConfig(s.data()))
    getDoc(doc(db, 'config', 'categorias')).then(s => {
      if (s.exists()) setCategorias(Object.entries(s.data()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)))
    })
    getDoc(doc(db, 'config', 'sectores')).then(s => {
      if (s.exists()) setSectores(Object.values(s.data()).sort())
    })
  }, [])

  useEffect(() => {
    if (!turnoId) return
    const q = query(collection(db, 'turnos', turnoId, 'incidencias'), orderBy('horaInicio', 'asc'))
    return onSnapshot(q, snap => setIncidencias(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [turnoId])

  const franjas = config ? generarFranjas(config) : []
  const incActivas = incidencias.filter(i => !i.eliminado)

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: '13px', background: '#f5f4ef', minHeight: '100vh' }}>

      <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '15px', fontWeight: '600', color: '#111' }}>Panel de Control</span>
        <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '20px', background: '#e8f5ee', color: '#1D9E75', fontWeight: '500' }}>Turno activo</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#999' }}>Obj: {config ? (config.objetivoGrande + config.objetivoChica) * franjas.length : '...'} ctos</span>
          <button onClick={() => signOut(auth)} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', color: '#888' }}>Salir</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '12px', padding: '12px' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '12px' }}>
            {[
              ['Incidencias', incActivas.length, incActivas.filter(i=>i.grado==='critico').length + ' críticas', '#E24B4A'],
              ['Tiempo perdido', '—', 'min en el turno', '#BA7517'],
              ['Cuartos producidos', '—', 'de ' + (config ? (config.objetivoGrande + config.objetivoChica) * franjas.length : '...'), '#1D9E75'],
            ].map(([l,v,s,c]) => (
              <div key={l} style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>{l}</div>
                <div style={{ fontSize: '22px', fontWeight: '600', color: c, lineHeight: 1 }}>{v}</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '3px' }}>{s}</div>
              </div>
            ))}
          </div>

          {franjas.map(franja => (
            <FranjaRow
              key={franja}
              franja={franja}
              incs={incActivas.filter(i => i.franja === franja)}
              onAgregar={() => { setFranjaDrawer(franja); setDrawerOpen(true) }}
              onEditar={setEditando}
              onEliminar={setEliminando}
              turnoId={turnoId}
              userData={userData}
            />
          ))}
        </div>

        <div>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Por sector</div>
          <SemaforoSectores incidencias={incActivas} sectores={sectores} />
        </div>
      </div>

      {drawerOpen && (
        <Drawer franja={franjaDrawer} turnoId={turnoId} user={user} userData={userData} onClose={() => setDrawerOpen(false)} />
      )}

      {editando && (
        <ModalEditar
          inc={editando}
          turnoId={turnoId}
          categorias={categorias}
          sectores={sectores}
          userData={userData}
          onClose={() => setEditando(null)}
        />
      )}

      {eliminando && userData.rol === 'owner' && (
        <ModalEliminar
          inc={eliminando}
          turnoId={turnoId}
          userData={userData}
          onClose={() => setEliminando(null)}
        />
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

function FranjaRow({ franja, incs, onAgregar, onEditar, onEliminar, turnoId, userData }) {
  const [open, setOpen] = useState(false)
  const label = franja.replace('-', ' — ')
  const criticas = incs.filter(i => i.grado === 'critico').length
  const moderadas = incs.filter(i => i.grado === 'moderado').length

  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '12px', marginBottom: '8px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer' }}>
        <span style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {criticas > 0 && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#fef2f2', color: '#E24B4A', fontWeight: '500' }}>{criticas} crítica{criticas > 1 ? 's' : ''}</span>}
          {moderadas > 0 && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#fff8ee', color: '#BA7517', fontWeight: '500' }}>{moderadas} mod.</span>}
          {incs.length === 0 && <span style={{ fontSize: '11px', color: '#ccc' }}>sin incidencias</span>}
          <span style={{ fontSize: '10px', color: '#ccc', marginLeft: '4px' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #f5f5f5' }}>
          {incs.map(inc => (
            <IncRow key={inc.id} inc={inc} turnoId={turnoId} onEditar={onEditar} onEliminar={onEliminar} userData={userData} />
          ))}
          <div onClick={onAgregar} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', fontSize: '12px', color: '#185FA5', borderTop: '1px dashed #dce8f5', background: '#f8fbff', cursor: 'pointer', fontWeight: '500' }}>
            + Cargar incidencia en esta franja
          </div>
        </div>
      )}
    </div>
  )
}

function IncRow({ inc, turnoId, onEditar, onEliminar, userData }) {
  const [open, setOpen] = useState(false)
  const [notaEdit, setNotaEdit] = useState(false)
  const [nota, setNota] = useState(inc.notaReunion || '')
  const [finEdit, setFinEdit] = useState(false)
  const [horaFin, setHoraFin] = useState(inc.horaFin || '')
  const [saving, setSaving] = useState(false)

  async function guardarNota() {
    setSaving(true)
    await updateDoc(doc(db, 'turnos', turnoId, 'incidencias', inc.id), {
      notaReunion: nota,
      notaReunionAutor: userData.nombre,
      notaReunionEn: serverTimestamp()
    })
    setSaving(false)
    setNotaEdit(false)
  }

  async function guardarFin() {
    setSaving(true)
    await updateDoc(doc(db, 'turnos', turnoId, 'incidencias', inc.id), { horaFin })
    setSaving(false)
    setFinEdit(false)
  }

  return (
    <div style={{ borderBottom: '1px solid #f5f5f5' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px', cursor: 'pointer' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: gradoColor[inc.grado] || '#ccc', flexShrink: 0 }} />
        <span style={{ fontSize: '11px', color: '#aaa', minWidth: '36px' }}>{inc.horaInicio}</span>
        <span style={{ fontSize: '12px', fontWeight: '500', color: '#333', minWidth: '80px' }}>{inc.sala === 'grande' ? 'Grande' : inc.sala === 'chica' ? 'Chica' : 'Ambas'}{inc.lineas?.length > 0 ? ' · ' + inc.lineas.join(' ') : ''}</span>
        <span style={{ flex: 1, fontSize: '12px', color: '#666' }}>{inc.categoriaNombre}</span>
        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: gradoColor[inc.grado] + '20', color: gradoColor[inc.grado], fontWeight: '500' }}>{inc.grado}</span>
        <span style={{ fontSize: '10px', color: '#ccc' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '12px 14px 14px 30px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            {[
              ['Responsable', inc.sectoresResponsables?.join(', ') || (inc.causaExterna ? 'Causa externa' : '—')],
              ['Afectado', inc.sectoresAfectados?.join(', ') || '—'],
              ['Inicio', inc.horaInicio],
              ['Fin', inc.horaFin || 'pendiente'],
            ].map(([l, v]) => (
              <div key={l} style={{ background: '#fff', borderRadius: '8px', padding: '7px 10px', border: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '2px' }}>{l}</div>
                <div style={{ fontSize: '12px', fontWeight: '500', color: '#333' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '12px', color: '#555', borderLeft: '3px solid #dce8f5', padding: '6px 10px', background: '#fff', borderRadius: '0 8px 8px 0', marginBottom: '10px', lineHeight: '1.5' }}>
            {inc.descripcion}
          </div>

          {!finEdit ? (
            inc.horaFin ? null :
            <button onClick={() => setFinEdit(true)} style={{ fontSize: '11px', color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginBottom: '8px', textDecoration: 'underline' }}>
              + Registrar hora de fin
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} style={{ fontSize: '13px', borderRadius: '8px', border: '1.5px solid #e8e8e8', padding: '6px 10px', width: '120px' }} />
              <button onClick={guardarFin} disabled={saving} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>Guardar</button>
              <button onClick={() => setFinEdit(false)} style={{ fontSize: '12px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888' }}>Cancelar</button>
            </div>
          )}

          <div style={{ fontSize: '11px', fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '6px' }}>Nota de reunión</div>
          {!notaEdit ? (
            <div>
              {inc.notaReunion
                ? <div style={{ fontSize: '12px', color: '#555', fontStyle: 'italic', background: '#fff', borderRadius: '8px', padding: '8px 10px', border: '1px solid #f0f0f0', marginBottom: '6px', lineHeight: '1.5' }}>{inc.notaReunion}</div>
                : <div style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic', border: '1px dashed #e8e8e8', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px' }}>Sin nota de reunión</div>
              }
              <button onClick={() => { setNota(inc.notaReunion || ''); setNotaEdit(true) }} style={{ fontSize: '11px', color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', padding: '0', textDecoration: 'underline' }}>
                {inc.notaReunion ? 'Editar nota' : '+ Agregar nota'}
              </button>
            </div>
          ) : (
            <div>
              <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Escribí la respuesta acordada en la reunión..." style={{ width: '100%', fontSize: '12px', minHeight: '60px', resize: 'vertical', borderRadius: '8px', border: '1.5px solid #185FA5', padding: '8px 10px', fontFamily: 'inherit', marginBottom: '6px' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={guardarNota} disabled={saving} style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '500' }}>Guardar nota</button>
                <button onClick={() => setNotaEdit(false)} style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888' }}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f0f0f0' }}>
            <button onClick={() => onEditar(inc)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#555', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✏️ Editar
            </button>
            {userData.rol === 'owner' && (
              <button onClick={() => onEliminar(inc)} style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '8px', border: '1px solid #fde8e8', background: '#fef2f2', cursor: 'pointer', color: '#E24B4A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🗑 Eliminar
              </button>
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
    await updateDoc(doc(db, 'turnos', turnoId, 'incidencias', inc.id), {
      grado, descripcion, categoriaId: categoria, categoriaNombre,
      sectoresResponsables: responsables,
      editadoPor: userData.nombre, editadoEn: serverTimestamp()
    })
    setSaving(false)
    onClose()
  }

  const filtrados = sectores.filter(s => s.toLowerCase().includes(busq.toLowerCase()))

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '440px', maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderRadius: '16px', zIndex: 21, padding: '24px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: '600', color: '#111' }}>Editar incidencia</div>
          <button onClick={onClose} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e8e8e8', background: '#fafafa', cursor: 'pointer', fontSize: '16px', color: '#888' }}>×</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#555', marginBottom: '8px' }}>Categoría</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {categorias.map(c => (
              <button key={c.id} onClick={() => { setCategoria(c.id); setCategoriaNombre(c.nombre) }} style={{ padding: '8px', fontSize: '12px', borderRadius: '8px', border: `1.5px solid ${categoria === c.id ? '#185FA5' : '#e8e8e8'}`, background: categoria === c.id ? '#f0f6ff' : '#fafafa', color: categoria === c.id ? '#185FA5' : '#555', cursor: 'pointer', fontWeight: categoria === c.id ? '600' : '400' }}>
                {c.nombre}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#555', marginBottom: '8px' }}>Grado</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {Object.entries(gradoColor).map(([g, c]) => (
              <button key={g} onClick={() => setGrado(g)} style={{ flex: 1, padding: '8px 4px', fontSize: '11px', fontWeight: grado === g ? '600' : '400', borderRadius: '8px', border: `1.5px solid ${grado === g ? c : '#e8e8e8'}`, background: grado === g ? c + '15' : '#fafafa', color: grado === g ? c : '#888', cursor: 'pointer' }}>
                {g}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#555', marginBottom: '8px' }}>Descripción</div>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} style={{ width: '100%', fontSize: '13px', minHeight: '70px', resize: 'vertical', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '10px 12px', fontFamily: 'inherit' }} />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#555', marginBottom: '8px' }}>Responsables</div>
          <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscá un sector..." style={{ width: '100%', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '8px 12px', marginBottom: '6px' }} />
          {busq && (
            <div style={{ border: '1px solid #e8e8e8', borderRadius: '10px', overflow: 'hidden', marginBottom: '6px', maxHeight: '120px', overflowY: 'auto' }}>
              {filtrados.map(s => (
                <div key={s} onClick={() => { setResponsables(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]); setBusq('') }} style={{ padding: '8px 12px', fontSize: '13px', cursor: 'pointer', background: responsables.includes(s) ? '#f0f6ff' : '#fff', borderBottom: '1px solid #f5f5f5' }}>
                  {responsables.includes(s) ? '✓ ' : ''}{s}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {responsables.map(r => (
              <span key={r} style={{ fontSize: '12px', padding: '3px 10px 3px 12px', borderRadius: '20px', background: '#f0f6ff', color: '#185FA5', border: '1px solid #b5d4f4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {r} <span onClick={() => setResponsables(p => p.filter(x => x !== r))} style={{ cursor: 'pointer', opacity: .6 }}>×</span>
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', fontWeight: '500' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex: 2, padding: '10px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', background: '#185FA5', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
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
    await updateDoc(doc(db, 'turnos', turnoId, 'incidencias', inc.id), {
      eliminado: true,
      eliminadoPor: userData.nombre,
      eliminadoEn: serverTimestamp(),
      motivoEliminacion: motivo
    })
    setSaving(false)
    onClose()
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 20 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '400px', background: '#fff', borderRadius: '16px', zIndex: 21, padding: '24px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: '17px', fontWeight: '600', color: '#111', marginBottom: '6px' }}>Eliminar incidencia</div>
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>Esta acción queda registrada en el log. No se puede deshacer.</div>

        <div style={{ background: '#fef2f2', border: '1px solid #fde8e8', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#333' }}>
          <strong>{inc.categoriaNombre}</strong> · {inc.horaInicio} · {inc.grado}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#555', marginBottom: '6px' }}>Motivo de eliminación <span style={{ color: '#E24B4A' }}>*</span></div>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="¿Por qué se elimina esta incidencia?" style={{ width: '100%', fontSize: '13px', minHeight: '60px', resize: 'vertical', borderRadius: '10px', border: '1.5px solid #e8e8e8', padding: '8px 12px', fontFamily: 'inherit' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '13px', borderRadius: '10px', border: '1.5px solid #e8e8e8', background: '#fff', cursor: 'pointer', color: '#888', fontWeight: '500' }}>Cancelar</button>
          <button onClick={confirmar} disabled={saving || !motivo.trim()} style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', background: motivo.trim() ? '#E24B4A' : '#f5a5a5', color: '#fff', border: 'none', cursor: motivo.trim() ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Eliminando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </>
  )
}

function SemaforoSectores({ incidencias, sectores }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {sectores.map(s => {
        const incs = incidencias.filter(i => i.sectoresResponsables?.includes(s))
        const critica = incs.some(i => i.grado === 'critico')
        const moderada = incs.some(i => i.grado === 'moderado')
        const color = critica ? '#E24B4A' : moderada ? '#BA7517' : '#1D9E75'
        return (
          <div key={s} style={{ background: '#fff', border: '1px solid #eee', borderRadius: '10px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: '500', color: '#333' }}>{s}</div>
              <div style={{ fontSize: '10px', color: '#aaa' }}>{incs.length > 0 ? `${incs.length} inc.` : 'sin novedades'}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
