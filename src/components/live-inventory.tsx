"use client";
import {OpenRecordPage} from "./record-page";
import {useEffect,useState} from "react";
import {NewRecordFields,useNewRecordFields} from "./new-asset-fields";
import {useStaffAccess} from "./staff-access-context";

type Data={products:{id:string;name:string;sku:string}[];branches:{id:string;name:string}[];stocks:{id:string;qty:number;reserved:number;reorderPoint:number;product:{id:string;name:string;sku:string};branch:{name:string}}[]};
const field="w-full rounded-xl border p-3";
const button="rounded-xl bg-indigo-600 px-4 py-2 text-white disabled:opacity-50";

export default function LiveInventory({spareParts=false}:{spareParts?:boolean}){
 const staff=useStaffAccess();
 const canCreateBranch=!spareParts&&staff.can("Branch","CREATE")&&staff.canEdit("Branch","name");
 const canAdjustStock=staff.can("Stock","EDIT")&&staff.canEdit("Stock","qty");
 const canEditStock=staff.can("Stock","EDIT");
 const [data,setData]=useState<Data>({products:[],branches:[],stocks:[]});
 const [search,setSearch]=useState(""),[low,setLow]=useState(false),[location,setLocation]=useState(""),[branch,setBranch]=useState(""),[product,setProduct]=useState(""),[delta,setDelta]=useState(""),[reason,setReason]=useState(""),[name,setName]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const branchFields=useNewRecordFields("Branch"),stockFields=useNewRecordFields("Stock");
 useEffect(()=>{const c=new AbortController();setBusy(true);fetch(spareParts?"/api/inventory?view=spare-parts":"/api/inventory",{signal:c.signal}).then(async r=>{const x=await r.json();if(!r.ok)throw new Error(x.error);setData(x)}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});return()=>c.abort()},[revision,spareParts]);
 async function submit(body:Record<string,unknown>){if(busy)return;setBusy(true);setError("");try{const r=await fetch("/api/inventory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const x=await r.json();if(!r.ok)throw new Error(x.error);setDelta("");setReason("");setName("");branchFields.setValues({});stockFields.setValues({});setRevision(v=>v+1)}catch(e){setError(e instanceof Error?e.message:"Operation failed")}finally{setBusy(false)}}
 const visible=data.stocks.filter(s=>(!low||s.qty-s.reserved<=s.reorderPoint)&&(!location||s.branch.name===location)&&[s.product.name,s.product.sku].join(" ").toLowerCase().includes(search.toLowerCase()));
 return <section className="space-y-5">
  {spareParts&&<section className="space-y-3 rounded-xl border bg-white p-4">
    <h2 className="font-semibold">Spare parts catalog</h2>
    {!data.products.length&&!busy&&<p className="text-sm text-slate-600">No active products are categorized as Spare Parts.</p>}
    {!!data.products.length&&<table className="w-full text-left text-sm">
      <thead><tr><th scope="col">Part</th><th scope="col">SKU</th><th scope="col">Available</th></tr></thead>
      <tbody>{data.products.map(part=><tr key={part.id} className="border-t">
        <td className="py-2"><OpenRecordPage entity="Product" id={part.id}>{part.name}</OpenRecordPage></td>
        <td>{part.sku}</td><td>{data.stocks.filter(stock=>stock.product.id===part.id)
          .reduce((total,stock)=>total+stock.qty-stock.reserved,0)}</td>
      </tr>)}</tbody>
    </table>}
  </section>}
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  <div className="grid gap-4 md:grid-cols-3">{[["Stock units",data.stocks.reduce((n,s)=>n+s.qty,0)],["Available units",data.stocks.reduce((n,s)=>n+s.qty-s.reserved,0)],["Low stock entries",data.stocks.filter(s=>s.qty-s.reserved<=s.reorderPoint).length]].map(([label,value])=><div key={label} className="rounded-2xl border bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>)}</div>
  {(canCreateBranch||canAdjustStock)&&<div className="grid gap-4 lg:grid-cols-2">
   {canCreateBranch&&
   <form className="space-y-3 rounded-2xl border bg-white p-5" onSubmit={e=>{e.preventDefault();submit({action:"branch",name,customValues:branchFields.values})}}>
    <h2 className="font-bold">Add stock location</h2><input required className={field} placeholder="Branch name" value={name} onChange={e=>setName(e.target.value)}/><NewRecordFields state={branchFields}/><button disabled={busy||!branchFields.fields} className={button}>Create branch</button>
   </form>}
   {canAdjustStock&&
   <form className="space-y-3 rounded-2xl border bg-white p-5" onSubmit={e=>{e.preventDefault();submit({productId:product,branchId:branch,delta:Number(delta),reason,customValues:stockFields.values})}}>
    <h2 className="font-bold">Adjust stock</h2><select required className={field} value={product} onChange={e=>setProduct(e.target.value)}><option value="">Select product</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select><select required className={field} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Select branch</option>{data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><input required type="number" step="1" className={field} placeholder="Quantity: +10 or -2" value={delta} onChange={e=>setDelta(e.target.value)}/><input required className={field} placeholder="Reason for adjustment" value={reason} onChange={e=>setReason(e.target.value)}/><NewRecordFields state={stockFields}/><button disabled={busy||!stockFields.fields} className={button}>Save adjustment</button>
   </form>}
  </div>}
  <div className="flex flex-wrap gap-2"><input aria-label="Search stock" className="min-w-0 flex-1 rounded-lg border p-2" placeholder="Search product or SKU" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter location" className="rounded-lg border p-2" value={location} onChange={e=>setLocation(e.target.value)}><option value="">All branches</option>{Array.from(new Set(data.stocks.map(s=>s.branch.name))).map(n=><option key={n}>{n}</option>)}</select><label className="flex items-center gap-2"><input type="checkbox" checked={low} onChange={e=>setLow(e.target.checked)}/>Low stock only</label></div>
  <div className="overflow-x-auto rounded-2xl border bg-white"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50"><tr>{["Product","Branch","On hand","Reserved","Available","Status"].map(x=><th key={x} className="p-4">{x}</th>)}</tr></thead><tbody>{visible.map(s=><tr key={s.id} className="border-t"><td className="p-4">{s.product.name} · {s.product.sku}<OpenRecordPage entity="Stock" id={s.id}/></td><td className="p-4">{s.branch.name}</td><td className="p-4">{s.qty}</td><td className="p-4">{s.reserved}</td><td className="p-4">{s.qty-s.reserved}</td><td className="p-4"><span className={s.qty-s.reserved<=s.reorderPoint?"font-semibold text-amber-700":"text-emerald-700"}>{s.qty-s.reserved<=s.reorderPoint?"Low stock":"Available"}</span></td></tr>)}</tbody></table>{!visible.length&&<p className="p-8 text-center text-slate-500">{busy?"Loading…":"No matching stock entries."}</p>}</div>
 </section>;
}
