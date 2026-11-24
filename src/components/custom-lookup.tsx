"use client";
import {objectManagerCatalog} from "@/lib/object-manager-catalog";
import {useEffect,useState} from "react";
export default function CustomLookup({target,value,required,disabled,onChange}:{target:unknown;value:string;required:boolean;disabled?:boolean;onChange:(value:string)=>void}) {
  const [records,setRecords]=useState<{id:string;record:{name:string}}[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();setRecords([]);setError("");if(typeof target!=="string"||!target){setError("Lookup target is missing");return ()=>controller.abort()}const standard=Object.prototype.hasOwnProperty.call(objectManagerCatalog,target);fetch(standard?"/api/setup/standard-records?entity="+encodeURIComponent(target):"/api/setup/custom-objects?object="+encodeURIComponent(target),{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);setRecords(standard?data.rows.map((row:Record<string,unknown>)=>({id:String(row.id),record:{name:String(row.name ?? row.number ?? row.brand ?? row.id)}})):data.records)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return ()=>controller.abort()},[target]);
  return <><select className="mt-1 block w-full rounded-lg border p-3" disabled={disabled} required={required} value={value} onChange={e=>onChange(e.target.value)}><option value="">Select a record</option>{value&&!records.some(r=>r.id===value)&&<option value={value}>{value}</option>}{records.map(r=><option key={r.id} value={r.id}>{r.record.name}</option>)}</select>{error&&<span role="alert">{error}</span>}<span className="text-xs text-slate-500">Shows up to 50 standard or 200 custom records.</span></>;
}
