"use client";
import CustomerLookup from "./customer-lookup";
import {OpenRecordPage} from "./record-page";
import {CustomValuesButton} from "@/components/custom-values";
import {NewRecordFields,useNewRecordFields} from "./new-asset-fields";
import {useEffect,useState} from "react";
import {SalesTable,SalesFilters,SalesStatus,statusLabel} from "./sales-table";
import {useStaffAccess} from "./staff-access-context";
type Item={productId:string;qty:number;unitPrice:string};
type Data={customers:{id:string;name:string;phone:string}[];products:{id:string;name:string;sku:string;price:string;stocks:{branchId:string;qty:number;reserved:number}[]}[];branches:{id:string;name:string}[];orders:{id:string;number:string;status:string;total:string;customer:{name:string};items:{id:string;qty:number;unitPrice:string;product:{name:string}}[]}[];branchByOrder:Record<string,string>;reservationAvailability?:Record<string,Record<string,boolean>>};
const blank=()=>({productId:"",qty:1,unitPrice:"0"});
const field="w-full rounded-xl border bg-white p-3 text-sm";
const btn="rounded-xl bg-[#6256dc] px-4 py-3 text-sm font-bold text-white disabled:opacity-50";

export default function LiveOrders(){
 const staff=useStaffAccess();
 const canCreate=staff.can("SalesOrder","CREATE")&&staff.canEdit("SalesOrder","customerId")
  &&staff.canRead("Customer","name")&&staff.canRead("Product","name");
 const canEditStatus=staff.can("SalesOrder","EDIT")&&staff.canEdit("SalesOrder","status");
 const canReserve=canEditStatus&&staff.can("Stock","EDIT")&&staff.canEdit("Stock","reserved");
 const canConfirm=canReserve&&staff.canRead("Branch","name");
 const canDeliver=canReserve&&staff.canEdit("Stock","qty");
 const [data,setData]=useState<Data>({customers:[],products:[],branches:[],orders:[],branchByOrder:{}});
 const [creating,setCreating]=useState(false);
 const [customerId,setCustomer]=useState("");
 const [branchId,setBranch]=useState("");
 const [items,setItems]=useState<Item[]>([blank()]);
 const [search,setSearch]=useState("");
 const [statusFilter,setStatusFilter]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 const customFields=useNewRecordFields("SalesOrder");

 useEffect(()=>{
  const c=new AbortController();
  setBusy(true);
  fetch("/api/orders",{signal:c.signal}).then(async r=>{
   const x=await r.json();
   if(!r.ok)throw new Error(x.error);
   setData(x);
  }).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});
  return()=>c.abort();
 },[revision]);

 async function submit(body:Record<string,unknown>){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const x=await r.json();
   if(!r.ok)throw new Error(x.error);
   if(body.action==="create"){setItems([blank()]);setCustomer("");setCreating(false)}
   setNotice("Order saved successfully");
   setRevision(v=>v+1);
  }catch(e){setError(e instanceof Error?e.message:"Operation failed")}finally{setBusy(false)}
 }

 function edit(i:number,patch:Partial<Item>){setItems(old=>old.map((v,j)=>i===j?{...v,...patch}:v))}
 const missingLookups = [
  ...(data.products.length ? [] : ["an accessible active product"]),
 ];
 const total=items.reduce((n,item)=>n+item.qty*Number(item.unitPrice),0);

 return <section className="space-y-5">
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{notice}</p>}
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{["DRAFT","CONFIRMED","DELIVERED","CANCELLED"].map(s=><div key={s} className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">{statusLabel(s)}</p><p className="text-2xl font-bold">{data.orders.filter(o=>o.status===s).length}</p></div>)}</div>
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Sales orders</h2>{canCreate&&<button type="button" className={btn} onClick={()=>setCreating(true)}>New sales order</button>}</div>
  {creating&&canCreate&&<form className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5" onSubmit={e=>{e.preventDefault();submit({action:"create",customerId,items,customValues:customFields.values})}}>
   <h2 className="font-bold">New sales order</h2>
   {!busy&&!error&&missingLookups.length>0&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
    To save a sales order, first make sure you have {missingLookups.join(" and ")}.
   </p>}
   <NewRecordFields
    state={customFields}
    standardValues={{customerId,number:"",status:"DRAFT",total}}
    onStandardChange={(key,value)=>{if(key==="customerId")setCustomer(String(value))}}
    renderStandardField={fieldMeta=>{
     if(fieldMeta.key==="customerId")return <CustomerLookup required disabled={fieldMeta.editable===false} value={customerId} onChange={setCustomer} label="Customer"/>;
     if(fieldMeta.key==="number")return <div className="text-sm"><p className="font-medium">{fieldMeta.label}</p><p className="mt-1 text-slate-500">Generated when the order is saved</p></div>;
     if(fieldMeta.key==="status")return <div className="text-sm"><p className="font-medium">{fieldMeta.label}</p><p className="mt-1">Draft</p></div>;
     if(fieldMeta.key==="total")return <div className="text-sm"><p className="font-medium">{fieldMeta.label}</p><p className="mt-1">₹{total.toLocaleString("en-IN")}</p></div>;
     if(fieldMeta.key==="createdAt")return <div className="text-sm"><p className="font-medium">{fieldMeta.label}</p><p className="mt-1 text-slate-500">Set on creation</p></div>;
     return null;
    }}
   />
   <h3 className="font-semibold">Order items</h3>
   {items.map((item,i)=><div key={i} className="grid gap-2 sm:grid-cols-4">
    <label className="text-xs">Product<select required className={field} value={item.productId} onChange={e=>edit(i,{productId:e.target.value,unitPrice:String(data.products.find(p=>p.id===e.target.value)?.price??"")})}><option value="">Select product</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?" ("+p.sku+")":""}{staff.canRead("Stock","qty")&&staff.canRead("Stock","reserved")&&staff.canRead("Stock","branchId")&&
     " · "+p.stocks.filter(s=>!branchId||s.branchId===branchId).reduce((n,s)=>n+s.qty-s.reserved,0)+" available"}</option>)}</select></label>
    <label className="text-xs">Quantity<input required type="number" min="1" step="1" className={field} value={item.qty} onChange={e=>edit(i,{qty:Number(e.target.value)})}/></label>
    <label className="text-xs">Unit price (₹)<input required type="number" min="0" step=".01" className={field} value={item.unitPrice} onChange={e=>edit(i,{unitPrice:e.target.value})}/></label>
    <button type="button" disabled={items.length===1} className="text-red-600" onClick={()=>setItems(old=>old.filter((_,j)=>j!==i))}>Remove</button>
   </div>)}
   <button type="button" disabled={items.length>=100} className="text-indigo-700" onClick={()=>setItems(old=>[...old,blank()])}>+ Add product</button>
   <p className="font-bold">Total before tax: ₹{total.toLocaleString("en-IN")}</p>
   <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-white py-3"><button type="button" disabled={busy} className="rounded-lg border px-4 py-2" onClick={()=>setCreating(false)}>Cancel</button><button disabled={busy||!customFields.fields||missingLookups.length>0} className={btn}>{busy?"Saving…":"Save draft order"}</button></div>
  </form>}
  <div className="space-y-4 rounded-2xl border bg-white p-5">
   {canConfirm&&<label className="block text-sm">Fulfilment branch for draft confirmation<select className={field} value={branchId} onChange={e=>setBranch(e.target.value)}><option value="">Select branch</option>{data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
   <SalesFilters query={search} onQuery={setSearch} status={statusFilter} onStatus={setStatusFilter} statuses={["DRAFT","CONFIRMED","DELIVERED","CANCELLED"]}/>
   <SalesTable headers={["Order","Customer / enquiry","Items","Total (₹)","Status and next action"]} busy={busy} empty={!data.orders.some(o=>(!statusFilter||o.status===statusFilter)&&[o.number,o.customer?.name,o.status,...o.items.map(i=>i.product?.name)].join(" ").toLowerCase().includes(search.toLowerCase()))}>
    {data.orders.filter(o=>(!statusFilter||o.status===statusFilter)&&[o.number,o.customer?.name,o.status,...o.items.map(i=>i.product?.name)].join(" ").toLowerCase().includes(search.toLowerCase())).map(o=><tr key={o.id}>
     <td className="break-all font-semibold">{o.number}<OpenRecordPage entity="SalesOrder" id={o.id}/><CustomValuesButton entity="SalesOrder" id={o.id}/><p className="text-xs text-slate-500">{data.branches.find(b=>b.id===data.branchByOrder[o.id])?.name||"No branch assigned"}</p></td>
     <td>{o.customer?.name??"—"}</td>
     <td><details><summary className="cursor-pointer">{o.items.length} lines</summary>{o.items.map(i=><p key={i.id} className="text-xs">{i.product?.name} × {i.qty} @ ₹{i.unitPrice}</p>)}</details></td>
     <td className="tabular-nums">{o.total==null?"—":Number(o.total).toLocaleString("en-IN")}</td>
     <td><div className="space-y-2">{o.status&&<SalesStatus value={o.status}/>}<div className="flex flex-wrap gap-3">
      {o.status==="DRAFT"&&canConfirm&&<button disabled={busy||!branchId||data.reservationAvailability?.[o.id]?.[branchId]===false} className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50" onClick={()=>{if(confirm("Confirm order and reserve branch stock?"))submit({action:"confirm",id:o.id,branchId})}}>Confirm & reserve</button>}
      {o.status==="DRAFT"&&canConfirm&&data.reservationAvailability?.[o.id]?.[branchId]===false&&
       <p className="text-xs text-amber-800">Insufficient stock at the selected branch.</p>}
      {o.status==="CONFIRMED"&&canDeliver&&<button disabled={busy} className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50" onClick={()=>{if(confirm("Deliver order and deduct reserved stock?"))submit({action:"deliver",id:o.id})}}>Mark delivered</button>}
      {["DRAFT","CONFIRMED"].includes(o.status)&&canReserve&&<button disabled={busy} className="text-red-600" onClick={()=>{if(confirm("Cancel order and release any reservation?"))submit({action:"cancel",id:o.id})}}>Cancel</button>}
     </div></div></td>
    </tr>)}
   </SalesTable>
  </div>
 </section>;
}
