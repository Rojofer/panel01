import { useState, useEffect } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

export default function Configuracion({ onClose }) {
  const [tab, setTab] = useState('turno')
  const [turno, setTurno] = useState(null)
  const [sectores, setSectores] = useState({})
  const [categorias, setCategorias] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getDoc(doc(db,'config','turno')).then(s => s.exists() && setTurno(s.data()))
    getDoc(doc(db,'config','sectores')).then(s => s.exists() && setSectores(s.data()))
    getDoc(doc(db,'config','categorias')).then(s => s.exists() && setCategorias(s.data()))
  }, [])

  async function guardarTurno() {
    setSaving(true)
    await updateDoc(doc(db,'config','turno'), turno)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function guardarSectores() {
    setSaving(true)
    await updateDoc(doc(db,'config','sectores'), sectores)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function guardarCategorias() {
    setSaving(true)
    await updateDoc(doc(db,'config','categorias'), categorias)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  function agregarSector() {
    const id = 's' + Date.now()
    setSectores(p => ({ ...p, [id]: '' }))
  }

  function agregarCategoria() {
    const id = 'c' + Date.now()
    setCategorias(p => ({ ...p, [id]: '' }))
  }

  function eliminarSector(id) { setSectores(p => { const n = {...p}; delete n[id]; return n }) }
  function eliminarCategoria(id) { setCategorias(p => { const n = {...p}; delete n[id]; return n }) }

  const tabs = [
    { id: 'turno', label: 'Turno' },
    { id: 'sectores', label: 'Sectores' },
    { id: 'categorias', label: 'Categorías' },
  ]

  const fieldLabel = (t) => <div style={{ fontSize:'12px', fontWeight:'600', color:'#555', marginBottom:'6px' }}>{t}</div>

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.25)', zIndex:10, backdropFilter:'blur(2px)' }} />
      <div style={{ fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif', position:'fixed', top:0, right:0, bottom:0, width:'420px', background:'#fff', borderLeft:'1px solid #f0f0f0', zIndex:11, display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.1)' }}>

        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #f0f0f0', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
            <div style={{ fontSize:'18px', fontWeight:'700', color:'#111' }}>Configuración</div>
            <button onClick={onClose} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1.5px solid #e8e8e8', background:'#fafafa', cursor:'pointer', fontSize:'18px', color:'#888', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
          <div style={{ display:'flex', gap:'4px' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:'7px 0', fontSize:'12px', fontWeight: tab===t.id ? '600' : '400', borderRadius:'8px', border:`1.5px solid ${tab===t.id?'#185FA5':'#e8e8e8'}`, background: tab===t.id?'#f0f6ff':'#fafafa', color: tab===t.id?'#185FA5':'#888', cursor:'pointer' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

          {tab === 'turno' && turno && (
            <div>
              <div style={{ marginBottom:'16px' }}>
                {fieldLabel('Hora de inicio')}
                <input type="time" value={turno.inicio} onChange={e => setTurno(p=>({...p,inicio:e.target.value}))} style={{ width:'100%', fontSize:'14px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'9px 12px' }} />
              </div>
              <div style={{ marginBottom:'16px' }}>
                {fieldLabel('Hora de fin')}
                <input type="time" value={turno.fin} onChange={e => setTurno(p=>({...p,fin:e.target.value}))} style={{ width:'100%', fontSize:'14px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'9px 12px' }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
                <div>
                  {fieldLabel('Objetivo sala grande (ctos/h)')}
                  <input type="number" value={turno.objetivoGrande} onChange={e => setTurno(p=>({...p,objetivoGrande:parseInt(e.target.value)}))} style={{ width:'100%', fontSize:'14px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'9px 12px' }} />
                </div>
                <div>
                  {fieldLabel('Objetivo sala chica (ctos/h)')}
                  <input type="number" value={turno.objetivoChica} onChange={e => setTurno(p=>({...p,objetivoChica:parseInt(e.target.value)}))} style={{ width:'100%', fontSize:'14px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'9px 12px' }} />
                </div>
              </div>
              <div style={{ background:'#fafafa', borderRadius:'12px', padding:'14px', marginBottom:'16px' }}>
                <div style={{ fontSize:'12px', fontWeight:'600', color:'#555', marginBottom:'12px' }}>Descansos</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'8px' }}>
                  <div><div style={{ fontSize:'11px', color:'#aaa', marginBottom:'4px' }}>Hora</div><input type="number" value={turno.descanso1Hora} onChange={e=>setTurno(p=>({...p,descanso1Hora:parseInt(e.target.value)}))} style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'7px 10px' }} /></div>
                  <div><div style={{ fontSize:'11px', color:'#aaa', marginBottom:'4px' }}>Minuto</div><input type="number" value={turno.descanso1Min} onChange={e=>setTurno(p=>({...p,descanso1Min:parseInt(e.target.value)}))} style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'7px 10px' }} /></div>
                  <div><div style={{ fontSize:'11px', color:'#aaa', marginBottom:'4px' }}>Duración (min)</div><input type="number" value={turno.descanso1Dur} onChange={e=>setTurno(p=>({...p,descanso1Dur:parseInt(e.target.value)}))} style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'7px 10px' }} /></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                  <div><input type="number" value={turno.descanso2Hora} onChange={e=>setTurno(p=>({...p,descanso2Hora:parseInt(e.target.value)}))} style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'7px 10px' }} /></div>
                  <div><input type="number" value={turno.descanso2Min} onChange={e=>setTurno(p=>({...p,descanso2Min:parseInt(e.target.value)}))} style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'7px 10px' }} /></div>
                  <div><input type="number" value={turno.descanso2Dur} onChange={e=>setTurno(p=>({...p,descanso2Dur:parseInt(e.target.value)}))} style={{ width:'100%', fontSize:'13px', borderRadius:'8px', border:'1.5px solid #e8e8e8', padding:'7px 10px' }} /></div>
                </div>
              </div>
              <button onClick={guardarTurno} disabled={saving} style={{ width:'100%', padding:'11px', fontSize:'13px', fontWeight:'700', borderRadius:'12px', background: saved?'#1D9E75':saving?'#aaa':'#185FA5', color:'#fff', border:'none', cursor:'pointer' }}>
                {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          )}

          {tab === 'sectores' && (
            <div>
              <div style={{ fontSize:'12px', color:'#aaa', marginBottom:'14px' }}>Los sectores aparecen en el formulario de carga y en el semáforo.</div>
              {Object.entries(sectores).sort((a,b)=>a[1].localeCompare(b[1])).map(([id, nombre]) => (
                <div key={id} style={{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
                  <input value={nombre} onChange={e => setSectores(p=>({...p,[id]:e.target.value}))} style={{ flex:1, fontSize:'13px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'8px 12px' }} />
                  <button onClick={() => eliminarSector(id)} style={{ width:'32px', height:'36px', borderRadius:'8px', border:'1px solid #fde8e8', background:'#fef9f9', cursor:'pointer', color:'#E24B4A', fontSize:'16px', flexShrink:0 }}>×</button>
                </div>
              ))}
              <button onClick={agregarSector} style={{ width:'100%', padding:'9px', fontSize:'12px', borderRadius:'10px', border:'1.5px dashed #b5d4f4', background:'#f0f6ff', color:'#185FA5', cursor:'pointer', fontWeight:'500', marginTop:'4px', marginBottom:'16px' }}>+ Agregar sector</button>
              <button onClick={guardarSectores} disabled={saving} style={{ width:'100%', padding:'11px', fontSize:'13px', fontWeight:'700', borderRadius:'12px', background: saved?'#1D9E75':saving?'#aaa':'#185FA5', color:'#fff', border:'none', cursor:'pointer' }}>
                {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          )}

          {tab === 'categorias' && (
            <div>
              <div style={{ fontSize:'12px', color:'#aaa', marginBottom:'14px' }}>Las categorías aparecen en el formulario de carga de incidencias.</div>
              {Object.entries(categorias).sort((a,b)=>a[1].localeCompare(b[1])).map(([id, nombre]) => (
                <div key={id} style={{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
                  <input value={nombre} onChange={e => setCategorias(p=>({...p,[id]:e.target.value}))} style={{ flex:1, fontSize:'13px', borderRadius:'10px', border:'1.5px solid #e8e8e8', padding:'8px 12px' }} />
                  <button onClick={() => eliminarCategoria(id)} style={{ width:'32px', height:'36px', borderRadius:'8px', border:'1px solid #fde8e8', background:'#fef9f9', cursor:'pointer', color:'#E24B4A', fontSize:'16px', flexShrink:0 }}>×</button>
                </div>
              ))}
              <button onClick={agregarCategoria} style={{ width:'100%', padding:'9px', fontSize:'12px', borderRadius:'10px', border:'1.5px dashed #b5d4f4', background:'#f0f6ff', color:'#185FA5', cursor:'pointer', fontWeight:'500', marginTop:'4px', marginBottom:'16px' }}>+ Agregar categoría</button>
              <button onClick={guardarCategorias} disabled={saving} style={{ width:'100%', padding:'11px', fontSize:'13px', fontWeight:'700', borderRadius:'12px', background: saved?'#1D9E75':saving?'#aaa':'#185FA5', color:'#fff', border:'none', cursor:'pointer' }}>
                {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
