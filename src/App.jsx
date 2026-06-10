import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import Login from './Login'
import Tablero from './Tablero'
import Informe from './Informe'

export default function App() {
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [vistaInforme, setVistaInforme] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (snap.exists() && snap.data().activo) {
          setUser(firebaseUser)
          setUserData(snap.data())
        } else {
          setUser(null)
          setUserData(null)
        }
      } else {
        setUser(null)
        setUserData(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#888' }}>Cargando...</p>
    </div>
  )

  if (!user) return <Login />

  if (vistaInforme) return <Informe onVolver={() => setVistaInforme(false)} />

  return <Tablero user={user} userData={userData} onVerInforme={() => setVistaInforme(true)} />
}

import Reportes from './Reportes'
// y en el render:
{vistaReportes && <Reportes onVolver={() => setVistaReportes(false)} />}
