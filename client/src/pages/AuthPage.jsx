import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../api';

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      if (mode === 'register') await api('/auth/register', { method: 'POST', body: { name, email, password } });
      const result = await api('/auth/login', { method: 'POST', body: { email, password } });
      localStorage.setItem('gp_token', result.token);
      localStorage.setItem('gp_user', JSON.stringify(result.user));
      onAuthenticated(result.user, result.token);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <div className="auth-page"><form className="auth-card" onSubmit={submit}>
    <div className="auth-brand"><div className="logo-icon"><Sparkles size={22}/></div><div><h1>GrowthPilot</h1><span>BUSINESS INTELLIGENCE</span></div></div>
    <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
    <p>{mode === 'login' ? 'Sign in to connect your real GrowthPilot data.' : 'Start with a secure GrowthPilot workspace.'}</p>
    {mode === 'register' && <label>Name<input value={name} onChange={e=>setName(e.target.value)} required placeholder="Your name" /></label>}
    <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com" /></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength="6" placeholder="Minimum 6 characters" /></label>
    {error && <div className="form-error">{error}</div>}
    <button className="primary-button auth-submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
    <button type="button" className="text-button auth-switch" onClick={()=>{setMode(mode==='login'?'register':'login');setError('')}}>{mode==='login'?'Need an account? Create one':'Already have an account? Sign in'}</button>
  </form></div>;
}
