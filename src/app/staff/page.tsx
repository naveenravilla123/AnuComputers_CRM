"use client";
import {useEffect,useState} from "react";
import {layoutColumns} from "@/lib/record-layout";
type User={name:string;role:string;permissions:string[]};
type Job = {
  id: string;
  sections: { name: string; columns: number; fields: { key: string; label: string; value: unknown }[] }[];
  case: { issue: string | null; priority: string | null; asset: { brand: string | null; model: string | null } | null };
};
export default function StaffPortal(){const [user,setUser]=useState<User|null>(null),[jobs,setJobs]=useState<Job[]>([]),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
async function load(){const r=await fetch("/api/staff-auth",{cache:"no-store"});if(!r.ok){setUser(null);setJobs([]);return}const u:User=await r.json();setUser(u);if(u.role==="TECHNICIAN"&&u.permissions.includes("JobCard:READ")){const j=await fetch("/api/staff-workspace",{cache:"no-store"});if(j.ok)setJobs((await j.json()).jobs);else{setJobs([]);setError("Unable to load assigned jobs")}}else setJobs([])}
useEffect(()=>{load().catch(()=>setError("Unable to load session")).finally(()=>setReady(true))},[]);
async function auth(action:string){setBusy(true);setError("");try{const r=await fetch("/api/staff-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,email,password})});const x=await r.json();if(!r.ok)throw Error(x.error);setPassword("");await load()}catch(e){setError(e instanceof Error?e.message:"Request failed")}finally{setBusy(false)}}
return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl font-bold">Anu Computers · Staff Portal</h1>{error&&<p role="alert" className="text-red-700">{error}</p>}{!ready?<p>Loading…</p>:user?<><p>{user.name} · {user.role}</p><button disabled={busy} className="rounded border p-2" onClick={()=>auth("logout")}>Sign out</button><button className="ml-2 rounded border p-2" onClick={()=>load().catch(()=>setError("Refresh failed"))}>Refresh</button>{user.role==="TECHNICIAN"&&user.permissions.includes("JobCard:READ")?<><h2 className="font-bold">Assigned and shared jobs</h2>{jobs.map(j=><article key={j.id} className="rounded-xl border p-4"><b>{j.case.asset?.brand} {j.case.asset?.model}</b><p>{[j.case.issue,j.case.priority].filter(Boolean).join(" · ")}</p>{j.sections.map((section,index)=>
  <fieldset className="mt-3 rounded border p-3" key={index}>
    <legend className="px-2 font-medium">{section.name}</legend>
    <dl className={layoutColumns(section.columns)}>{section.fields.map(field=><div key={field.key}>
      <dt className="text-sm font-medium">{field.label}</dt>
      <dd>{field.value==null?"—":typeof field.value==="boolean"?(field.value?"Yes":"No"):String(field.value)}</dd>
    </div>)}</dl>
  </fieldset>
)}</article>)}{!jobs.length&&<p>No jobs available.</p>}</>:<p>No operational modules enabled for your account yet.</p>}</>:<form className="space-y-3 rounded-xl border p-5" onSubmit={e=>{e.preventDefault();auth("login")}}><label className="block">Email<input className="block w-full rounded border p-3" required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="block">Password<input className="block w-full rounded border p-3" required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy} className="rounded bg-indigo-600 px-4 py-2 text-white">Sign in</button></form>}</main>}
