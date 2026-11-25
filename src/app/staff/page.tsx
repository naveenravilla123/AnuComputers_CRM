"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {
  Home,Boxes,BriefcaseBusiness,ClipboardList,FileText,Headphones,LogOut,Package,RefreshCw,
  MessageSquare,ReceiptText,ShieldCheck,ShoppingCart,Truck,Users,Wrench,UserRoundPlus,Wallet,
  type LucideIcon,
} from "lucide-react";
import Attention from "@/components/attention";
import Customers from "@/components/customers";
import LiveProducts from "@/components/live-products";
import LiveInventory from "@/components/live-inventory";
import LivePurchases from "@/components/live-purchases";
import LiveLeads from "@/components/live-leads";
import LiveQuotes from "@/components/live-quotes";
import LiveOrders from "@/components/live-orders";
import LiveBilling, {canUseCheckout} from "@/components/live-billing";
import LiveRepairs from "@/components/live-repairs";
import LiveServiceAdmin from "@/components/live-service-admin";
import LiveAfterSales from "@/components/live-after-sales";
import LiveReports from "@/components/live-reports";
import {layoutColumns} from "@/lib/record-layout";
import {STAFF_WORKSPACE_HEADER} from "@/lib/staff-request-context";
import {arrangeNavigation,isStandaloneGroup} from "@/lib/workspace-navigation";
import {useWorkspaceNavigation,workspaceNavigationChanged} from "@/components/use-workspace-navigation";
import {navigateModule,useCrmUrl} from "@/lib/crm-navigation";
import {RoutedRecordPage,useRoutedRecord} from "@/components/record-page";
import {staffAccessRules,StaffAccessProvider} from "@/components/staff-access-context";

declare global {
  interface Window {
    __anuStaffWorkspaceFetchPatched?: boolean;
  }
}

if (typeof window !== "undefined" && window.location.pathname === "/staff" && !window.__anuStaffWorkspaceFetchPatched) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init && init.headers).forEach((value, key) => headers.set(key, value));
    // Keep staff API requests isolated when an admin session shares the browser.
    headers.set(STAFF_WORKSPACE_HEADER, "staff");
    return originalFetch(input, {...init, headers});
  };
  window.__anuStaffWorkspaceFetchPatched = true;
}

type User={id:string;name:string;email:string;role:string;permissions:string[];fieldPermissions:string[];profileId?:string};
type Job={id:string;sections:{name:string;columns:number;fields:{key:string;label:string;value:unknown}[]}[];case:{issue:string|null;priority:string|null;asset:{brand:string|null;model:string|null;serialNumber?:string|null}|null}};
type Module={id:string;label?:string;group:string;icon:LucideIcon;grants:string[];fields?:string[];technicianOnly?:boolean};
const fields=(entity:string,...keys:string[])=>keys.map(key=>entity+":"+key+":READ");

const modules:Module[]=[
  {id:"My Jobs",group:"My Work",icon:ClipboardList,grants:["JobCard:READ"],technicianOnly:true},
  {id:"Customers",group:"Sales",icon:Users,grants:["Customer:READ"]},
  {id:"Enquiries",group:"Sales",icon:UserRoundPlus,grants:["Lead:READ"]},
  {id:"Products",group:"Inventory",icon:Package,grants:["Product:READ"]},
  {id:"Inventory",group:"Inventory",icon:Boxes,grants:["Stock:READ","Product:READ","Branch:READ"],fields:[...fields("Product","name","sku"),...fields("Branch","name"),...fields("Stock","qty","reserved","reorderPoint")]},
  {id:"Suppliers",group:"Purchasing",icon:Truck,grants:["PurchaseOrder:READ","Supplier:READ","Product:READ","Branch:READ","Stock:READ"],fields:[...fields("Supplier","name","phone","email","gstin"),...fields("Product","name","sku","cost"),...fields("Branch","name"),...fields("PurchaseOrder","number","supplierId","status","total")]},
  {id:"Quotations",group:"Sales",icon:FileText,grants:["Quote:READ"]},
  {id:"Sales Orders",group:"Sales",icon:ShoppingCart,grants:["SalesOrder:READ"]},
  {id:"Invoices",group:"Finance",icon:ReceiptText,grants:["Invoice:READ","Customer:READ","Product:READ","Stock:READ","Branch:READ","SalesOrder:READ","Payment:READ"],fields:[...fields("Customer","name","phone"),...fields("Product","name","sku","price"),...fields("Stock","qty","reserved","branchId"),...fields("Branch","name"),...fields("SalesOrder","number","total"),...fields("Invoice","number","status","subtotal","tax","discount","total"),...fields("Payment","amount","method","reference","paidAt")]},
  {id:"Payments",group:"Finance",icon:Wallet,grants:["Invoice:READ","Customer:READ","Product:READ","Stock:READ","Branch:READ","SalesOrder:READ","Payment:READ"],fields:[...fields("Customer","name","phone"),...fields("Product","name","sku","price"),...fields("Stock","qty","reserved","branchId"),...fields("Branch","name"),...fields("SalesOrder","number","total"),...fields("Invoice","number","status","subtotal","tax","discount","total"),...fields("Payment","amount","method","reference","paidAt")]},
  {id:"Service Cases",group:"Service",icon:Headphones,grants:["ServiceCase:READ","Customer:READ","Asset:READ","JobCard:READ","Staff:READ","Product:READ","Stock:READ","Branch:READ","Invoice:READ"],fields:[...fields("Customer","name","phone"),...fields("ServiceCase","issue","status","priority","estimate"),...fields("Asset","brand","model","serialNumber","condition","receivedAccessories"),...fields("JobCard","diagnosis","notes","laborCost","status","technicianId"),...fields("Staff","name"),...fields("Product","name","sku","price","cost"),...fields("Stock","qty","reserved","branchId"),...fields("Branch","name"),...fields("Invoice","number")]},
  {id:"Job Cards",group:"Service",icon:ClipboardList,grants:["ServiceCase:READ","Customer:READ","Asset:READ","JobCard:READ","Staff:READ","Product:READ","Stock:READ","Branch:READ","Invoice:READ"],fields:[...fields("Customer","name","phone"),...fields("ServiceCase","issue","status","priority","estimate"),...fields("Asset","brand","model","serialNumber","condition","receivedAccessories"),...fields("JobCard","diagnosis","notes","laborCost","status","technicianId"),...fields("Staff","name"),...fields("Product","name","sku","price","cost"),...fields("Stock","qty","reserved","branchId"),...fields("Branch","name"),...fields("Invoice","number")]},
  {id:"Warranties",group:"Service",icon:ShieldCheck,grants:["Asset:READ","Warranty:READ","Staff:READ","JobCard:READ","ServiceCase:READ","Customer:READ","Product:READ"],fields:[...fields("Staff","name","email","role","active"),...fields("JobCard","status"),...fields("ServiceCase","issue"),...fields("Customer","name"),...fields("Asset","brand","model","serialNumber","customerId"),...fields("Warranty","type","startDate","endDate","terms"),...fields("Product","name","brand")]},
  {id:"After Sales",group:"Service",icon:Wrench,grants:["Warranty:READ","Invoice:READ","SalesOrder:READ","Product:READ","Branch:READ","Asset:READ","Customer:READ","Payment:READ"],fields:[...fields("Warranty","type","startDate","endDate","terms"),...fields("Asset","brand","model","serialNumber"),...fields("Customer","name"),...fields("Invoice","number","status","tax","discount","total"),...fields("SalesOrder","status"),...fields("Product","name"),...fields("Payment","amount","method","reference","paidAt"),...fields("Branch","name")]},
  {id:"Communications",group:"Sales",icon:MessageSquare,grants:["Communication:READ","Customer:READ"],fields:[...fields("Communication","channel","recipient","template","status","externalId","createdAt"),...fields("Customer","phone")]},
  {id:"Reports",group:"Finance",icon:BriefcaseBusiness,grants:["Invoice:READ","Payment:READ","Stock:READ","Product:READ","Branch:READ","ServiceCase:READ","Staff:READ","JobCard:READ","Warranty:READ","Asset:READ","Customer:READ","Communication:READ"],fields:[...fields("Invoice","number","total","status","createdAt","orderId","caseId","customerId"),...fields("Payment","amount","paidAt"),...fields("Stock","qty","reserved","reorderPoint"),...fields("Product","name","sku"),...fields("Branch","name"),...fields("ServiceCase","status","createdAt"),...fields("Staff","name","active"),...fields("JobCard","status","technicianId"),...fields("Warranty","startDate","endDate"),...fields("Asset","brand","model","serialNumber"),...fields("Customer","name"),...fields("Communication","channel","recipient","template","status","externalId","createdAt")]},
];
const homeModule:Module={id:"Dashboard",group:"Home",icon:Home,grants:[]};
const invoiceModule=modules.find(module=>module.id==="Invoices")!;
modules.push({...invoiceModule,id:"POS Billing",icon:ShoppingCart});
const input="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";
const button="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function StaffPortal(){
  const [user,setUser]=useState<User|null>(null),[jobs,setJobs]=useState<Job[]>([]);
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  const requestedModule=useCrmUrl().get("module");
  const available=useMemo(()=>user?[homeModule,...modules].filter(module=>
    (!module.technicianOnly||user.role==="TECHNICIAN")&&module.grants.every(grant=>user.permissions.includes(grant))&&
    (module.fields||[]).every(grant=>user.fieldPermissions.includes(grant))
  ):[],[user]);

  const navigation=useWorkspaceNavigation(!!user);
  const sidebar=arrangeNavigation(available,navigation);
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  const active=available.find(module=>module.id===requestedModule)?.id??
    (available.some(module=>module.id==="My Jobs")?"My Jobs":"Dashboard");
  const canBook=available.some(module=>module.id==="Service Cases") &&
    user?.permissions.includes("ServiceCase:CREATE") && user.permissions.includes("Asset:CREATE") && user.permissions.includes("JobCard:CREATE");
  const canSell=available.some(module=>module.id==="POS Billing") &&
    !!user && canUseCheckout(staffAccessRules(user));
  const [bookRepair,setBookRepair]=useState(false);
  const [attention,setAttention]=useState("");
  const routedRecord=useRoutedRecord(active==="Customers");

  const load=useCallback(async()=>{
    setError("");
    const response=await fetch("/api/staff-auth",{cache:"no-store"});
    if(!response.ok){setUser(null);setJobs([]);return}
    const current:User=await response.json();
    setUser(current);
    if(current.role==="TECHNICIAN"&&current.permissions.includes("JobCard:READ")){
      const jobResponse=await fetch("/api/staff-workspace",{cache:"no-store"});
      if(!jobResponse.ok)throw Error("Unable to load your assigned jobs");
      setJobs((await jobResponse.json()).jobs);
    }else setJobs([]);
  },[]);

  useEffect(()=>{load().catch(()=>setError("Unable to load your staff workspace")).finally(()=>setReady(true))},[load]);

  async function authenticate(action:"login"|"logout"){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/staff-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,email,password})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||"Unable to authenticate");
      setPassword("");
      if(action==="logout"){setUser(null);setJobs([])}
      else await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Request failed")}
    finally{setBusy(false)}
  }

  function renderModule(){
    if (!available.some(module => module.id === active)) return null;
    const staffAccess={permissions:user?.permissions??[],fieldPermissions:user?.fieldPermissions??[]};
    switch(active){
      case "Dashboard":return <div className="space-y-4"><section className="space-y-4 rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Start work</h2>
        <div className="flex flex-wrap gap-3">
          {canSell&&<button className={button} onClick={()=>navigateModule("POS Billing")}>New Sale</button>}
          {canBook&&<button className={button} onClick={()=>{setBookRepair(true);navigateModule("Service Cases")}}>Book Repair</button>}
          {available.filter(module=>["Customers","Invoices","Inventory","Reports"].includes(module.id)).map(module=>
            <button key={module.id} className="rounded-xl border px-4 py-2.5 text-sm" onClick={()=>navigateModule(module.id)}>{module.id}</button>)}
        </div>
      </section><Attention selected={attention} onSelect={setAttention} onModule={navigateModule}
        allowedModules={available.map(module=>module.id)}/></div>;
      case "My Jobs":return <MyJobs jobs={jobs}/>;
      case "Customers":return <Customers open={false} onClose={()=>{}} staffAccess={staffAccess}/>;
      case "Enquiries":return <LiveLeads mode="Enquiries" staffAccess={staffAccess}/>;
      case "Products":return <LiveProducts open={false} onClose={()=>{}}/>;
      case "Inventory":return <LiveInventory/>;
      case "Suppliers":return <LivePurchases mode="Suppliers"/>;
      case "Quotations":return <LiveQuotes/>;
      case "Sales Orders":return <LiveOrders/>;
      case "POS Billing":case "Invoices":case "Payments":return <LiveBilling key={active} mode={active}/>;
      case "Service Cases":case "Job Cards":return <LiveRepairs key={active} mode={active} initialIntake={bookRepair}/>;
      case "Warranties":return <LiveServiceAdmin mode="Warranties"/>;
      case "After Sales":return <LiveAfterSales/>;
      case "Reports":return <LiveReports mode="Reports"/>;
      case "Communications":return <LiveReports mode="Communications"/>;
      default:return null;
    }
  }

  if(!ready)return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading your workspace…</main>;
  if(!user)return <main className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-slate-50 to-white p-4">
    <div className="w-full max-w-md rounded-3xl border border-white bg-white/90 p-8 shadow-xl shadow-indigo-950/5">
      <div className="mb-7 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-white"><BriefcaseBusiness size={23}/></div><div><p className="font-bold text-slate-900">Anu Computers</p><p className="text-sm text-slate-500">Staff workspace</p></div></div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1><p className="mb-6 mt-1 text-sm text-slate-500">Sign in to open the CRM modules assigned to your profile.</p>
      {error&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <form className="space-y-4" onSubmit={event=>{event.preventDefault();authenticate("login")}}>
        <label className="block text-sm font-medium text-slate-700">Work email<input className={input+" mt-1.5"} required type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)}/></label>
        <label className="block text-sm font-medium text-slate-700">Password<input className={input+" mt-1.5"} required type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/></label>
        <button disabled={busy} className={button+" w-full"}>{busy?"Signing in…":"Sign in securely"}</button>
      </form>
      <p className="mt-6 border-t pt-4 text-xs leading-5 text-slate-400">Your assigned CRM profile controls which modules and record fields are available. Ask your administrator to update your access in Setup.</p>
    </div>
  </main>;

  return <main className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
    <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white"><BriefcaseBusiness size={20}/></div><div><p className="font-bold">Anu Computers</p><p className="text-xs text-slate-500">Staff workspace</p></div></div>
      <nav aria-label="CRM modules" className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-y-auto">
        {sidebar.map(({group,entries})=>{
          return <div key={group} className="lg:mb-5">
            {!isStandaloneGroup(group,entries.length)&&<button type="button" aria-expanded={expanded[group]??entries.some(module=>module.id===active)}
              className="px-3 py-2.5 text-left text-sm font-semibold" onClick={()=>setExpanded(previous=>({...previous,[group]:!(previous[group]??entries.some(module=>module.id===active))}))}>{group}</button>}
            {(isStandaloneGroup(group,entries.length)||(expanded[group]??entries.some(module=>module.id===active)))&&<div className="flex gap-1 lg:flex-col">{entries.map(module=>{const Icon=module.icon;return <button key={module.id} aria-current={active===module.id?"page":undefined} onClick={()=>{setBookRepair(false);navigateModule(module.id)}} className={"flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition "+(active===module.id?"bg-indigo-50 text-indigo-700":"text-slate-600 hover:bg-slate-100")}><Icon size={17}/><span>{module.label??module.id}</span></button>})}</div>}
          </div>;
        })}
      </nav>
      <div className="hidden border-t border-slate-100 p-4 lg:block"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-100 font-bold text-indigo-700">{user.name.slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-slate-500">{user.role}</p></div><button title="Sign out" aria-label="Sign out" disabled={busy} onClick={()=>authenticate("logout")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><LogOut size={17}/></button></div></div>
    </aside>
    <section className="min-w-0 flex-1">
      <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
        <div><p className="text-xs font-medium text-indigo-600">{user.profileId?"Assigned custom profile":"Role profile"} · {user.role}</p><h1 className="text-lg font-bold">{active==="Dashboard"?"Home":active}</h1></div>
        <div className="flex items-center gap-2"><button onClick={()=>{window.dispatchEvent(new Event(workspaceNavigationChanged));load().catch(()=>setError("Refresh failed"))}} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Refresh workspace"><RefreshCw size={17}/></button><button onClick={()=>authenticate("logout")} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 lg:hidden"><LogOut size={16}/>Sign out</button></div>
      </header>
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-7">
        {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {!active?<section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h2 className="text-lg font-semibold">No modules assigned yet</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Your account is active, but its role profile, custom profile, or permission sets do not currently grant access to an operational module. Contact your CRM administrator to configure access in Setup.</p><p className="mt-4 text-xs text-slate-400">Administrator-only Setup and staff account tools are not available in the staff workspace.</p></section>:<>{active&&<StaffAccessProvider key={JSON.stringify([user.id, user.permissions, user.fieldPermissions])} access={user}>{routedRecord&&<RoutedRecordPage record={routedRecord}/>}<div hidden={!!routedRecord}>{renderModule()}</div></StaffAccessProvider>}</>}
      </div>
    </section>
  </main>;
}

function MyJobs({jobs}:{jobs:Job[]}){
  return <section className="space-y-4">
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-5"><h2 className="text-lg font-semibold">Assigned and shared jobs</h2><p className="mt-1 text-sm text-slate-600">Job cards assigned to you or shared with your technician account.</p></div>
    {!jobs.length&&<p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">No jobs are currently assigned or shared with you.</p>}
    <div className="grid gap-4 xl:grid-cols-2">{jobs.map(job=><article key={job.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{job.case.asset?.brand||"Device"} {job.case.asset?.model||""}</h3><p className="mt-1 text-sm text-slate-600">{job.case.issue||"Service case"}</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{job.case.priority||"Assigned"}</span></div>{job.sections.map((section,index)=><fieldset key={index} className="rounded-xl border border-slate-100 p-3"><legend className="px-2 text-sm font-semibold">{section.name}</legend><dl className={layoutColumns(section.columns)}>{section.fields.map(field=><div key={field.key}><dt className="text-xs font-medium text-slate-500">{field.label}</dt><dd className="mt-1 break-words text-sm">{field.value==null?"—":typeof field.value==="boolean"?(field.value?"Yes":"No"):String(field.value)}</dd></div>)}</dl></fieldset>)}</article>)}</div>
  </section>;
}
