"use client";
import CustomerLookup from "./customer-lookup";

import {useNewAssetFields,NewAssetFields,NewRecordFields,useNewRecordFields} from "./new-asset-fields";
import {OpenRecordPage} from "./record-page";
import {CustomValuesButton} from "./custom-values";
import {useEffect,useState} from "react";
import {useStaffAccess} from "./staff-access-context";

type Asset={id:string;brand:string;model:string|null;serialNumber:string|null;customer:{name:string}};
type Data={
 technicians:{id:string;name:string;email:string;active:boolean;assignments:{id:string;status:string;case:{issue:string;customer:{name:string}}}[]}[];
 assets:Asset[];
 warranties:{id:string;type:string;startDate:string;endDate:string;terms:string|null;asset:Asset}[];
 products:{id:string;name:string;brand:string|null}[];
 customers:{id:string;name:string;phone:string}[];
};
const field="w-full rounded-xl border bg-white p-3 text-sm",btn="rounded-xl bg-indigo-600 px-4 py-2 text-white disabled:opacity-50";
const staffBlank={id:"",name:"",email:"",active:true},assetBlank={customerId:"",productId:"",brand:"",model:"",serialNumber:""},warrantyBlank={id:"",assetId:"",type:"PRODUCT",startDate:"",endDate:"",terms:""};
const date=(value:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
const warrantyStatus=(start:string,end:string)=>new Date(start).getTime()>Date.now()?"Scheduled":new Date(end).getTime()<Date.now()?"Expired":new Date(end).getTime()-Date.now()<=30*86400000?"Expiring soon":"Active";

export default function LiveServiceAdmin({mode}:{mode:string}){
 const staffAccess=useStaffAccess();
 const canCreateTechnician=staffAccess.can("Staff","CREATE")&&["name","email","active"].every(key=>staffAccess.canEdit("Staff",key));
 const canEditTechnician=staffAccess.can("Staff","EDIT")&&["name","email","active"].every(key=>staffAccess.canEdit("Staff",key));
 const canReassign=staffAccess.can("JobCard","EDIT")&&staffAccess.canEdit("JobCard","technicianId")&&staffAccess.can("Staff","READ")&&staffAccess.canRead("Staff","name");
 const canCreateAsset=staffAccess.can("Asset","CREATE")&&["customerId","productId","brand","model","serialNumber"].every(key=>staffAccess.canEdit("Asset",key));
 const canCreateWarranty=staffAccess.can("Warranty","CREATE")&&["assetId","type","startDate","endDate","terms"].every(key=>staffAccess.canEdit("Warranty",key));
 const canEditWarranty=staffAccess.can("Warranty","EDIT")&&["assetId","type","startDate","endDate","terms"].every(key=>staffAccess.canEdit("Warranty",key));
 const [data,setData]=useState<Data>({technicians:[],assets:[],warranties:[],products:[],customers:[]});
 const [staff,setStaff]=useState(staffBlank),[asset,setAsset]=useState(assetBlank),[warranty,setWarranty]=useState(warrantyBlank);
 const [query,setQuery]=useState(""),[filter,setFilter]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const assetFields=useNewAssetFields(),warrantyFields=useNewRecordFields("Warranty");

 useEffect(()=>{
  const controller=new AbortController();
  setBusy(true);
  fetch("/api/service-admin",{signal:controller.signal}).then(async response=>{
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   setData(result);
  }).catch(cause=>{if(!controller.signal.aborted)setError(cause.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});
  return()=>controller.abort();
 },[revision]);

 async function save(body:Record<string,unknown>){
  if(busy)return;
  setBusy(true);setError("");
  try{
   const payload=body.action==="warranty"&&!body.id?{...body,customValues:warrantyFields.values}:body;
   const response=await fetch("/api/service-admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   if(body.action==="technician")setStaff(staffBlank);
   if(body.action==="asset"){setAsset(assetBlank);assetFields.setValues({});setWarranty(previous=>({...previous,assetId:result.id}))}
   if(body.action==="warranty"){setWarranty(warrantyBlank);warrantyFields.setValues({})}
   setRevision(value=>value+1);
  }catch(cause){setError(cause instanceof Error?cause.message:"Operation failed")}
  finally{setBusy(false)}
 }

 return <section className="space-y-5">
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  {mode==="Technicians"?<>
   {(staff.id?canEditTechnician:canCreateTechnician)&&<form className="space-y-3 rounded-2xl border bg-white p-5" onSubmit={event=>{event.preventDefault();save({action:"technician",...staff})}}>
    <h2 className="font-bold">{staff.id?"Edit technician":"Register technician"}</h2>
    <label>Name<input required className={field} value={staff.name} onChange={event=>setStaff({...staff,name:event.target.value})}/></label>
    <label>Email<input required type="email" className={field} value={staff.email} onChange={event=>setStaff({...staff,email:event.target.value})}/></label>
    <label className="flex gap-2"><input type="checkbox" checked={staff.active} onChange={event=>setStaff({...staff,active:event.target.checked})}/>Active</label>
    <button disabled={busy} className={btn}>Save technician</button>
    <button type="button" className="ml-3" onClick={()=>setStaff(staffBlank)}>Clear</button>
   </form>}
   <div className="grid gap-3 md:grid-cols-2">{data.technicians.map(technician=><article key={technician.id} className="space-y-3 rounded-2xl border bg-white p-5">
    <h3 className="font-bold">{technician.name} · {technician.active?"Active":"Inactive"}</h3><p>{technician.email}</p>
    <p>Open jobs: {technician.assignments.filter(job=>!["DELIVERED","CANCELLED"].includes(job.status)).length} · Delivered: {technician.assignments.filter(job=>job.status==="DELIVERED").length}</p>
    {canEditTechnician&&<button className="text-indigo-700" onClick={()=>setStaff({id:technician.id,name:technician.name,email:technician.email,active:technician.active})}>Edit technician</button>}
    {technician.assignments.filter(job=>!["DELIVERED","CANCELLED"].includes(job.status)).map(job=><div key={job.id} className="border-t pt-2">
     <p>{job.case.customer.name} · {job.case.issue} · {job.status}</p>
     {canReassign&&<select className={field} disabled={busy} value="" onChange={event=>{if(event.target.value&&confirm("Reassign this job?"))save({action:"reassign",jobId:job.id,technicianId:event.target.value})}}>
      <option value="">Reassign job</option>{data.technicians.filter(candidate=>candidate.active&&candidate.id!==technician.id).map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
     </select>}
    </div>)}
   </article>)}</div>
  </>:<>
   {(canCreateAsset||canCreateWarranty||canEditWarranty)&&<div className="grid gap-4 xl:grid-cols-2">
    {canCreateAsset&&
    <form className="space-y-3 rounded-2xl border bg-white p-5" onSubmit={event=>{event.preventDefault();save({action:"asset",...asset,assetCustomValues:assetFields.values})}}>
     <h2 className="font-bold">Register customer device</h2>
     <CustomerLookup required value={asset.customerId} onChange={customerId=>setAsset(previous=>({...previous,customerId}))}/>
     <select className={field} value={asset.productId} onChange={event=>{const product=data.products.find(item=>item.id===event.target.value);setAsset({...asset,productId:event.target.value,brand:product?.brand||asset.brand,model:product?.name||asset.model})}}><option value="">Optional catalog product</option>{data.products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select>
     {(["brand","model","serialNumber"] as const).map(key=><label key={key} className="block capitalize">{key}<input required={key==="brand"} className={field} value={asset[key]} onChange={event=>setAsset({...asset,[key]:event.target.value})}/></label>)}
     <NewAssetFields state={assetFields}/>
     <button disabled={busy||!assetFields.fields} className={btn}>Save device</button>
    </form>}

    {(canCreateWarranty||canEditWarranty)&&
    <form className="space-y-3 rounded-2xl border bg-white p-5" onSubmit={event=>{event.preventDefault();save({action:"warranty",...warranty})}}>
     <h2 className="font-bold">{warranty.id?"Edit warranty":"Register warranty"}</h2>
     <select required className={field} value={warranty.assetId} onChange={event=>setWarranty({...warranty,assetId:event.target.value})}><option value="">Select device</option>{data.assets.map(item=><option key={item.id} value={item.id}>{item.customer.name} · {item.brand} {item.model} · {item.serialNumber||"No serial"}</option>)}</select>
     <select className={field} value={warranty.type} onChange={event=>setWarranty({...warranty,type:event.target.value})}><option>PRODUCT</option><option>REPAIR</option></select>
     <div className="grid gap-3 sm:grid-cols-2">{(["startDate","endDate"] as const).map(key=><label key={key}>{key}<input required type="date" className={field} value={warranty[key]} onChange={event=>setWarranty({...warranty,[key]:event.target.value})}/></label>)}</div>
     <textarea className={field} placeholder="Warranty terms" value={warranty.terms} onChange={event=>setWarranty({...warranty,terms:event.target.value})}/>
     {!warranty.id&&<NewRecordFields state={warrantyFields}/>}
     <button disabled={busy||(!warranty.id&&!warrantyFields.fields)} className={btn}>Save warranty</button>
     <button type="button" className="ml-3" onClick={()=>{setWarranty(warrantyBlank);warrantyFields.setValues({})}}>Clear</button>
    </form>}
   </div>}

   <section className="rounded-2xl border bg-white p-5">
    <h2 className="font-bold">Customer devices</h2>
    {!data.assets.length&&<p className="mt-2 text-sm text-slate-500">No devices registered.</p>}
    {data.assets.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2">
     <span>{item.customer.name} · {item.brand} {item.model} · {item.serialNumber||"No serial"}</span>
     {staffAccess.can("Asset","EDIT")&&<CustomValuesButton entity="Asset" id={item.id} label="Custom fields" onSaved={()=>setRevision(value=>value+1)}/>}
    </div>)}
   </section>

   <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{["Active","Expiring soon","Expired","Scheduled"].map(status=><button key={status} className="rounded-xl border bg-white p-3 text-left" onClick={()=>setFilter(filter===status?"":status)}>{status}<p className="text-xl font-bold">{data.warranties.filter(item=>warrantyStatus(item.startDate,item.endDate)===status).length}</p></button>)}</div>
   <input className={field} placeholder="Search warranty by customer or serial" value={query} onChange={event=>setQuery(event.target.value)}/>
   {data.warranties.filter(item=>(!filter||warrantyStatus(item.startDate,item.endDate)===filter)&&[item.asset.customer.name,item.asset.brand,item.asset.model,item.asset.serialNumber,item.type].join(" ").toLowerCase().includes(query.toLowerCase())).map(item=><article key={item.id} className="rounded-xl border bg-white p-4">
    <h3 className="font-bold">{item.asset.customer.name} · {item.asset.brand} {item.asset.model}</h3>
    <p>{item.type} · {warrantyStatus(item.startDate,item.endDate)} · {date(item.startDate)} – {date(item.endDate)}</p>
    <p>{item.asset.serialNumber} · {item.terms}</p>
    <div className="mt-2 flex gap-4">{canEditWarranty&&<button className="text-indigo-700" onClick={()=>setWarranty({id:item.id,assetId:item.asset.id,type:item.type,startDate:date(item.startDate),endDate:date(item.endDate),terms:item.terms||""})}>Edit warranty</button>}<OpenRecordPage entity="Warranty" id={item.id}/>{staffAccess.can("Warranty","EDIT")&&<CustomValuesButton entity="Warranty" id={item.id} label="Custom fields" onSaved={()=>setRevision(value=>value+1)}/>}</div>
   </article>)}
  </>}
 </section>;
}
