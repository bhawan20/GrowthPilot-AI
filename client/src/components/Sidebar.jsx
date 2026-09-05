import { LayoutDashboard, Users, BrainCircuit, Lightbulb, SlidersHorizontal, BarChart3, CircleDollarSign, Sparkles, LogOut, Plus, ChevronDown, TrendingUp } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useState } from 'react';
const menuItems=[['Dashboard',LayoutDashboard,'/'],['Customers',Users,'/customers'],['Revenue Events',CircleDollarSign,'/revenue'],['Forecasts',TrendingUp,'/forecasts'],['AI Intelligence',BrainCircuit,'/intelligence'],['Decision Center',Lightbulb,'/decisions'],['Simulator',SlidersHorizontal,'/simulator'],['Analytics',BarChart3,'/analytics']];
export default function Sidebar({user,workspaces,workspaceId,onWorkspaceChange,onCreateWorkspace,onLogout}){
 const [open,setOpen]=useState(false); const current=workspaces.find(w=>w.id===workspaceId);
 async function add(){const name=prompt('New workspace name');if(name?.trim()){try{await onCreateWorkspace(name.trim())}catch(e){alert(e.message)}}}
 return <aside className="sidebar"><div className="sidebar-logo"><div className="logo-icon"><Sparkles size={20}/></div><div><h2>GrowthPilot</h2><span>AI INTELLIGENCE</span></div></div>
 <div className="workspace-switcher"><button onClick={()=>setOpen(!open)}><span>WORKSPACE</span><strong>{current?.name||'Select workspace'}</strong><ChevronDown size={15}/></button>{open&&<div className="workspace-menu">{workspaces.map(w=><button key={w.id} className={w.id===workspaceId?'selected':''} onClick={()=>{onWorkspaceChange(w.id);setOpen(false)}}>{w.name}</button>)}<button className="create-workspace" onClick={add}><Plus size={14}/> New workspace</button></div>}</div>
 <nav className="sidebar-nav"><p className="nav-label">WORKSPACE</p>{menuItems.map(([name,Icon,path])=><NavLink key={name} to={path} end={path==='/'} className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon size={20}/><span>{name}</span></NavLink>)}</nav>
 <div className="ai-status"><div className="status-top"><div className="status-icon"><BrainCircuit size={18}/></div><span>DATA ENGINE</span></div><h4>Backend connected</h4><p>Live pages now load from your protected API and MongoDB.</p></div>
 <div className="user-profile"><div className="avatar">{(user?.name||'U').slice(0,2).toUpperCase()}</div><div className="user-info"><strong>{user?.name}</strong><span>{user?.email}</span></div><button className="logout-button" onClick={onLogout} title="Sign out"><LogOut size={16}/></button></div></aside>
}
