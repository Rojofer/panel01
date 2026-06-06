import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from './firebase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f5f5f5', fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: '#fff', padding: '2rem', borderRadius: '12px',
        border: '1px solid #e5e5e5', width: '100%', maxWidth: '360px'
      }}>
        <h1 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '4px' }}>
          Panel de Control
        </h1>
        <p style={{ fontSize: '13px', color: '#888', marginBottom: '1.5rem' }}>
          Industria cárnica
        </p>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required style={{ width: '100%', fontSize: '13px' }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>
              Contraseña
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required style={{ width: '100%', fontSize: '13px' }}
            />
          </div>
          {error && (
            <p style={{ fontSize: '12px', color: '#E24B4A', marginBottom: '12px' }}>{error}</p>
          )}
          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '9px', fontSize: '13px', fontWeight: '500',
              background: '#185FA5', color: '#fff', border: 'none',
              borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
