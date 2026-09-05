import './App.css';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import WorkspacePage from './pages/WorkspacePage';
import AuthPage from './pages/AuthPage';

function AppShell({ user, token, onLogout }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(localStorage.getItem('gp_workspace') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadWorkspaces() {
    setLoading(true); setError('');
    try {
      const data = await api('/workspaces', { token });
      setWorkspaces(data.workspaces || []);
      const currentValid = data.workspaces?.some(w => w.id === workspaceId);
      if (!currentValid) {
        const next = data.workspaces?.[0]?.id || '';
        setWorkspaceId(next); localStorage.setItem('gp_workspace', next);
      }
    } catch (err) { setError(err.message); if (err.status === 401) onLogout(); }
    finally { setLoading(false); }
  }
  useEffect(()=>{loadWorkspaces();},[]);

  async function createWorkspace(name) {
    const data = await api('/workspaces', { token, method:'POST', body:{name} });
    setWorkspaces(prev=>[data.workspace,...prev]);
    setWorkspaceId(data.workspace.id); localStorage.setItem('gp_workspace', data.workspace.id);
  }
  function selectWorkspace(id){ setWorkspaceId(id); localStorage.setItem('gp_workspace', id); }

  return <div className="app-layout">
    <Sidebar user={user} workspaces={workspaces} workspaceId={workspaceId} onWorkspaceChange={selectWorkspace} onCreateWorkspace={createWorkspace} onLogout={onLogout}/>
    <main className="main-content">
      {loading ? <div className="loading-screen">Loading your workspaces…</div> : error ? <div className="empty-state"><h2>Connection problem</h2><p>{error}</p><button className="primary-button" onClick={loadWorkspaces}>Retry</button></div> : !workspaceId ? <div className="empty-state"><h2>Create your first workspace</h2><p>Your backend is connected. Create a workspace to start storing real customers and analytics.</p><button className="primary-button" onClick={()=>{const name=prompt('Workspace name'); if(name?.trim()) createWorkspace(name.trim()).catch(e=>setError(e.message));}}>Create workspace</button></div> : <Routes>
        <Route path="/" element={<Dashboard token={token} workspaceId={workspaceId} user={user} />} />
        <Route path="/customers" element={<WorkspacePage type="customers" token={token} workspaceId={workspaceId} />} />
        <Route path="/revenue" element={<WorkspacePage type="revenue" token={token} workspaceId={workspaceId} />} />
        <Route path="/forecasts" element={<WorkspacePage type="forecasts" token={token} workspaceId={workspaceId} />} />
        <Route path="/intelligence" element={<WorkspacePage type="intelligence" token={token} workspaceId={workspaceId} />} />
        <Route path="/decisions" element={<WorkspacePage type="decisions" token={token} workspaceId={workspaceId} />} />
        <Route path="/simulator" element={<WorkspacePage type="simulator" token={token} workspaceId={workspaceId} />} />
        <Route path="/analytics" element={<WorkspacePage type="analytics" token={token} workspaceId={workspaceId} />} />
        <Route path="*" element={<Navigate to="/" replace/>} />
      </Routes>}
    </main>
  </div>;
}

export default function App(){
  const [token,setToken]=useState(localStorage.getItem('gp_token')||'');
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('gp_user')||'null')}catch{return null}});
  useEffect(()=>{ if(!token) return; api('/auth/me',{token}).then(r=>{setUser(r.user);localStorage.setItem('gp_user',JSON.stringify(r.user));}).catch(()=>{localStorage.removeItem('gp_token');setToken('');setUser(null);});},[]);
  const logout=()=>{localStorage.removeItem('gp_token');localStorage.removeItem('gp_user');localStorage.removeItem('gp_workspace');setToken('');setUser(null);};
  return <BrowserRouter>{token&&user?<AppShell user={user} token={token} onLogout={logout}/>:<AuthPage onAuthenticated={(u,t)=>{setUser(u);setToken(t)}}/>}</BrowserRouter>;
}
