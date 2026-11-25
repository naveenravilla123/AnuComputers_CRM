"use client";
import {useEffect,useState} from "react";
import MetadataFields,{type Field,type Values} from "./metadata-fields";
import {Plus,Pencil,Trash2,Package,X} from "lucide-react";
import {OpenRecordPage} from "./record-page";
import {useStaffAccess} from "./staff-access-context";
type Product={id:string;name:string;sku:string;category:string;brand:string|null;price:string;cost:string;active:boolean;specifications?:{image?:string;description?:string};stocks:{qty:number;reserved:number}[]};
type ProductMetadata={fields:Field[];sections:unknown;standardFields?:string[];standardEditable?:Record<string,boolean>;standardOverrides?:Record<string,{label:string;required:boolean}>};
const blank={id:"",name:"",sku:"",category:"Laptops",brand:"",price:"",cost:"0",image:"",description:"",active:true};
const productStandardFields:Field[]=[
 {key:"name",label:"Name",type:"TEXT",required:true},
 {key:"sku",label:"SKU",type:"TEXT",required:true},
 {key:"category",label:"Category",type:"TEXT",required:true},
 {key:"brand",label:"Brand",type:"TEXT",required:false},
 {key:"price",label:"Selling price (₹)",type:"CURRENCY",required:true,min:0},
 {key:"cost",label:"Purchase price (₹)",type:"CURRENCY",required:true,min:0},
 {key:"specifications",label:"Product specifications",type:"CUSTOM",required:false},
 {key:"active",label:"Active product",type:"CHECKBOX",required:true}
];
export default function LiveProducts({open,onClose}:{open:boolean;onClose:()=>void}){
 const staff=useStaffAccess();
 const canCreate=staff.can("Product","CREATE")&&["name","sku","category","price","cost"].every(key=>staff.canEdit("Product",key));
 const canEdit=staff.can("Product","EDIT")&&["name","sku","category","brand","price","cost","active","specifications"].some(key=>staff.canEdit("Product",key));
 const canDelete=staff.can("Product","DELETE");
 const [rows,setRows]=useState<Product[]>([]);
 const [form,setForm]=useState(blank);
 const [editing,setEditing]=useState(false);
 const [query,setQuery]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 const [metadata,setMetadata]=useState<ProductMetadata|null>(null);
 const [custom,setCustom]=useState<Values>({});
 const [metaError,setMetaError]=useState("");
 const [status,setStatus]=useState("all");

 useEffect(()=>{
  const c=new AbortController();
  setBusy(true);
  fetch("/api/products",{signal:c.signal}).then(async r=>{
   const x=await r.json();
   if(!r.ok)throw new Error(x.error);
   setRows(x);
  }).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});
  return()=>c.abort();
 },[revision]);

 useEffect(()=>{
  if(!editing)return;
  const c=new AbortController();
  setMetadata(null);
  setCustom({});
  setMetaError("");
  Promise.all([
   fetch("/api/record-metadata?entity=Product",{signal:c.signal}),
   form.id?fetch("/api/custom-values?entity=Product&id="+encodeURIComponent(form.id),{signal:c.signal}):Promise.resolve(null)
  ]).then(async ([m,v])=>{
   if(!m.ok||v&&!v.ok)throw Error("Unable to load product fields");
   const meta=await m.json(),values=v?await v.json():{values:{}};
   if(!c.signal.aborted){setMetadata(meta);setCustom(values.values??{})}
  }).catch(e=>{if(!c.signal.aborted)setMetaError(e.message)});
  return()=>c.abort();
 },[editing,form.id]);

 useEffect(()=>{if(open){setForm(blank);setEditing(true);onClose()}},[open,onClose]);

 async function save(){
  if(busy||!metadata)return;
  if(!form.id&&(!form.name.trim()||!form.sku.trim()||!form.category.trim())){setError("Name, SKU and category are required.");return}
  if(form.price!==""&&Number(form.price)<0||form.cost!==""&&Number(form.cost)<0){setError("Prices cannot be negative.");return}
  setBusy(true);setError("");
  try{
   const payload:Record<string,unknown>={...form,customValues:Object.fromEntries(metadata.fields.filter(field=>field.editable!==false).map(field=>[field.key,custom[field.key]]))};
   for(const key of ["name","sku","category","brand","price","cost","active","specifications"])if(metadata.standardEditable?.[key]===false){if(key==="specifications"){delete payload.image;delete payload.description}else delete payload[key]}
   const r=await fetch("/api/products",{method:form.id?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const x=await r.json();
   if(!r.ok)throw new Error(x.error);
   setEditing(false);setRevision(v=>v+1);
  }catch(e){setError(e instanceof Error?e.message:"Save failed")}finally{setBusy(false)}
 }

 async function remove(id:string){
  if(!confirm("Delete this product?"))return;
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/products?id="+encodeURIComponent(id),{method:"DELETE"});
   const x=await r.json();
   if(!r.ok)throw new Error(x.error);
   setRevision(v=>v+1);
  }catch(e){setError(e instanceof Error?e.message:"Delete failed")}finally{setBusy(false)}
 }

 const filtered=rows.filter(p=>status==="all"||(status==="active"?p.active:!p.active)).filter(p=>[p.name,p.sku,p.category,p.brand||""].join(" ").toLowerCase().includes(query.toLowerCase()));
 const productFormFields=metadata?[
  ...productStandardFields.filter(field=>metadata.standardFields?.includes(field.key)).map(field=>({
   ...field,
   label:metadata.standardOverrides?.[field.key]?.label??field.label,
   required:metadata.standardOverrides?.[field.key]?.required??field.required,
   editable:metadata.standardEditable?.[field.key]??true
  })),
  ...metadata.fields
 ]:[];

 return <section className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <input className="rounded-xl border bg-white p-3 text-sm" aria-label="Search products" placeholder="Search products or SKU" value={query} onChange={e=>setQuery(e.target.value)}/>
   <select aria-label="Product status" className="rounded-lg border bg-white p-2 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
   {canCreate&&<button onClick={()=>{setForm(blank);setEditing(true);setError("")}} className="flex items-center gap-2 rounded-xl bg-[#6256dc] px-4 py-3 text-white"><Plus size={18}/> New product</button>}
  </div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
  <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[760px] text-left text-sm">
   <thead className="bg-slate-50 text-slate-600"><tr>{["Product","SKU","Category","Selling price","Available","Status","Actions"].map(h=><th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
   <tbody>{filtered.map(p=><tr key={p.id} className="border-t hover:bg-slate-50">
    <td className="px-3 py-2"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">{p.specifications?.image?<img src={p.specifications.image} alt="" className="h-full w-full object-contain" referrerPolicy="no-referrer" loading="lazy"/>:<Package size={20}/>}</div><div><b>{p.name}</b><p className="text-xs text-slate-500">{p.brand}</p></div></div></td>
    <td className="px-3 py-2">{p.sku}</td><td className="px-3 py-2">{p.category}</td><td className="px-3 py-2 tabular-nums">₹{Number(p.price).toLocaleString("en-IN")}</td><td className="px-3 py-2">{p.stocks.reduce((n,s)=>n+s.qty-s.reserved,0)}</td>
    <td className="px-3 py-2"><span className={p.active?"text-emerald-700":"text-slate-500"}>{p.active?"Active":"Inactive"}</span></td>
    <td className="px-3 py-2"><div className="flex gap-3"><OpenRecordPage entity="Product" id={p.id}/>{canEdit&&<button disabled={busy} aria-label="Edit product" onClick={()=>{setForm({id:p.id,name:p.name||"",sku:p.sku||"",category:p.category||"",brand:p.brand||"",price:String(p.price??""),cost:String(p.cost??""),image:p.specifications?.image||"",description:p.specifications?.description||"",active:p.active??true});setEditing(true);setError("")}}><Pencil size={18}/></button>}{canDelete&&<button disabled={busy} aria-label="Delete product" className="text-red-600" onClick={()=>remove(p.id)}><Trash2 size={18}/></button>}</div></td>
   </tr>)}</tbody>
  </table></div>
  {!filtered.length&&<p className="rounded-xl bg-white p-10 text-center text-slate-500">{busy?"Loading products…":"No products found. Add your first product."}</p>}
  {editing&&<div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-900/60 p-4"><form onSubmit={e=>{e.preventDefault();save()}} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6">
   <div className="mb-5 flex justify-between"><h2 className="text-xl font-bold">{form.id?"Edit":"New"} product</h2><button type="button" onClick={()=>setEditing(false)}><X/></button></div>
   {metadata&&<MetadataFields fields={productFormFields} sections={metadata.sections} values={{...form,...custom}} onChange={(key,value)=>{
    if(metadata.fields.some(field=>field.key===key)){setCustom(previous=>({...previous,[key]:value}));return}
    if(key==="active"){setForm(previous=>({...previous,active:value===true}));return}
    if(key==="name"||key==="sku"||key==="category"||key==="brand"||key==="price"||key==="cost")setForm(previous=>({...previous,[key]:String(value)}));
    }} renderCustomField={field=>field.key==="specifications"?<div className="space-y-3"><p className="font-medium">Product specifications</p><label className="block text-sm font-medium">HTTPS image URL<input disabled={metadata.standardEditable?.specifications===false} className="mt-1 w-full rounded-lg border p-3" type="url" value={form.image} onChange={e=>setForm({...form,image:e.target.value})}/></label><label className="block text-sm font-medium">Description<textarea disabled={metadata.standardEditable?.specifications===false} className="mt-1 w-full rounded-lg border p-3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div>:null}/>}
   {metaError&&<p role="alert" className="mt-3 text-red-600">{metaError}</p>}
   {error&&<p role="alert" className="mt-3 text-red-600">{error}</p>}
   <button disabled={busy||!metadata} className="mt-5 w-full rounded-xl bg-[#6256dc] p-3 font-bold text-white">{busy?"Saving…":"Save product"}</button>
  </form></div>}
 </section>
}
