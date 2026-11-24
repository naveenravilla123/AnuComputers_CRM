import {accessibleJobIds,canAccessServiceCase} from "@/lib/record-sharing";
import {saveNewCustomValues} from "@/lib/new-custom-values";
import {validateStandardOverrides} from "@/lib/standard-field-overrides";
import {validateRecord} from "@/lib/record-validation";
import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {prisma} from "@/lib/prisma";
import {authorizeAll} from "@/lib/request-access";
import {assertStaffFieldEdits,canReadStaffFields,filterStaffRecord,filterStaffResponse} from "@/lib/staff-field-access";
import {saveRecordCustomValues} from "@/lib/save-record-custom-values";
import type {PermissionObject} from "@/lib/permissions";
export const dynamic="force-dynamic";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
const decimal=(v:unknown)=>{if(!/^\d{1,10}(\.\d{1,2})?$/.test(String(v)))throw new Error("Invalid amount");return new Prisma.Decimal(String(v))};
const next:Record<string,string>={RECEIVED:"DIAGNOSIS",DIAGNOSIS:"AWAITING_APPROVAL",AWAITING_APPROVAL:"APPROVED",APPROVED:"REPAIR",REPAIR:"QUALITY_CHECK",QUALITY_CHECK:"READY_FOR_PICKUP",READY_FOR_PICKUP:"DELIVERED"};
export async function GET(r:NextRequest){
 const objects=["ServiceCase","Customer","Asset","JobCard","Staff","Product","Stock","Branch","Invoice"].map(object=>({object:object as PermissionObject,action:"READ" as const}));
 const auth=await authorizeAll(r,objects);
 if(!auth.allowed)return fail(auth.status===401?"Unauthorized":"Forbidden",auth.status);
 if(auth.access.kind==="staff"&&!canReadStaffFields(auth.access.user,[["Customer","name"],["Customer","phone"],["ServiceCase","issue"],["ServiceCase","status"],["ServiceCase","priority"],["ServiceCase","estimate"],["Asset","brand"],["Asset","model"],["Asset","serialNumber"],["Asset","condition"],["Asset","receivedAccessories"],["JobCard","diagnosis"],["JobCard","notes"],["JobCard","laborCost"],["JobCard","status"],["JobCard","technicianId"],["Staff","name"],["Product","name"],["Product","sku"],["Product","price"],["Product","cost"],["Stock","qty"],["Stock","reserved"],["Stock","branchId"],["Branch","name"],["Invoice","number"]]))return fail("Forbidden",403);
 try{
  const scopedIds=auth.access.kind==="staff"?await accessibleJobIds(prisma,auth.access.user):null;
  const [customers,cases,technicians,products,branches]=await Promise.all([
   prisma.customer.findMany({where:scopedIds===null?undefined:{cases:{some:{jobs:{some:{id:{in:scopedIds}}}}}},select:{id:true,name:true,phone:true}}),
   prisma.serviceCase.findMany({where:scopedIds===null?undefined:{jobs:{some:{id:{in:scopedIds}}}},include:{customer:true,asset:true,jobs:{include:{technician:true,parts:{include:{product:true}}}},invoices:true},orderBy:{createdAt:"desc"}}),
   prisma.staff.findMany({where:{active:true,role:"TECHNICIAN"}}),
   prisma.product.findMany({where:{active:true},include:{stocks:true}}),
   prisma.branch.findMany(),
  ]);
  const result={customers,cases,technicians,products,branches};
  return NextResponse.json(auth.access.kind==="staff"?filterStaffResponse(auth.access.user,result,{customers:"Customer",cases:"ServiceCase",technicians:"Staff",products:"Product",branches:"Branch"}):result,{headers:{"Cache-Control":"no-store"}});
 }catch{return fail("Database unavailable",503)}
}
export async function POST(r:NextRequest){
 if(r.headers.get("origin")!==r.nextUrl.origin)return fail("Invalid origin",403);
 try{
  const x=await r.json();
  const requirements=x.action==="create"
   ?[{object:"ServiceCase" as const,action:"CREATE" as const},{object:"Asset" as const,action:"CREATE" as const},{object:"JobCard" as const,action:"CREATE" as const},{object:"Customer" as const,action:"READ" as const}]
   :x.action==="details"
    ?[{object:"ServiceCase" as const,action:"EDIT" as const},{object:"JobCard" as const,action:"EDIT" as const}]
    :x.action==="part"
     ?[{object:"JobCard" as const,action:"EDIT" as const},{object:"Stock" as const,action:"EDIT" as const},{object:"Stock" as const,action:"READ" as const},{object:"Product" as const,action:"READ" as const},{object:"Branch" as const,action:"READ" as const}]
     :x.action==="invoice"
      ?[{object:"ServiceCase" as const,action:"READ" as const},{object:"Invoice" as const,action:"CREATE" as const}]
      :x.action==="advance"
       ?[{object:"ServiceCase" as const,action:"EDIT" as const},{object:"JobCard" as const,action:"EDIT" as const}]:[];
  if(!requirements.length)return fail("Invalid action");
  const auth=await authorizeAll(r,requirements);
  if(!auth.allowed)return fail(auth.status===401?"Unauthorized":"Forbidden",auth.status);
  const staffUser=auth.access.kind==="staff"?auth.access.user:undefined;
  if(staffUser&&x.action!=="create"&&!await canAccessServiceCase(prisma,staffUser,String(x.id||"")))return fail("Forbidden: record access required",403);
  if(staffUser&&x.action==="create"){
   assertStaffFieldEdits(staffUser,"Asset",["customerId","brand","model","serialNumber","condition","receivedAccessories"]);
   assertStaffFieldEdits(staffUser,"ServiceCase",["customerId","assetId","issue","status","priority"]);
   assertStaffFieldEdits(staffUser,"JobCard",["caseId","status","laborCost"]);
  }
  if(staffUser&&x.action==="details"){
   assertStaffFieldEdits(staffUser,"JobCard",["diagnosis","notes","laborCost","technicianId"]);
   assertStaffFieldEdits(staffUser,"ServiceCase",["estimate"]);
  }
  if(staffUser&&x.action==="part"){
   assertStaffFieldEdits(staffUser,"Stock",["qty"]);
   if(!canReadStaffFields(staffUser,[["Product","active"],["Product","price"],["Stock","qty"],["Stock","reserved"]]))return fail("Forbidden",403);
  }
  if(staffUser&&x.action==="invoice")assertStaffFieldEdits(staffUser,"Invoice",["number","customerId","caseId","subtotal","tax","discount","total","status"]);
  if(staffUser&&x.action==="advance"){
   assertStaffFieldEdits(staffUser,"ServiceCase",["status","approvedAt"]);
   assertStaffFieldEdits(staffUser,"JobCard",["status","deliveredAt"]);
  }
  const result=await prisma.$transaction(async tx=>{
if(x.action==="create"){const brand=String(x.brand||"").trim(),issue=String(x.issue||"").trim(),customerId=String(x.customerId||"");if(!brand||!issue||!customerId)throw new Error("Customer, device brand and issue required");const asset=await tx.asset.create({data:{customerId,brand,model:String(x.model||""),serialNumber:String(x.serialNumber||""),condition:String(x.condition||""),receivedAccessories:String(x.accessories||"")}});await validateStandardOverrides(tx,"Asset",asset);await saveNewCustomValues(tx,"Asset",asset.id,x.assetCustomValues,staffUser);await validateRecord(tx,"Asset",asset);const serviceCase=await tx.serviceCase.create({data:{customerId,assetId:asset.id,issue,priority:["NORMAL","HIGH","URGENT"].includes(x.priority)?x.priority:"NORMAL",jobs:{create:{}}}});await saveNewCustomValues(tx,"ServiceCase",serviceCase.id,x.caseCustomValues,staffUser);const job=await tx.jobCard.findFirstOrThrow({where:{caseId:serviceCase.id}});await saveNewCustomValues(tx,"JobCard",job.id,x.jobCustomValues,staffUser);await validateRecord(tx,"JobCard",job);return validateRecord(tx,"ServiceCase",serviceCase)}
const c=await tx.serviceCase.findUniqueOrThrow({where:{id:String(x.id)},include:{jobs:{include:{parts:true}},invoices:true}});const job=c.jobs.find(j=>j.id===x.jobId)||c.jobs[0];if(!job)throw new Error("Job missing");
if(x.action==="details"){if(!["RECEIVED","DIAGNOSIS"].includes(c.status))throw new Error("Diagnosis locked after estimate");const estimate=decimal(x.estimate),laborCost=decimal(x.laborCost);if(x.technicianId&&!await tx.staff.findFirst({where:{id:String(x.technicianId),active:true,role:"TECHNICIAN"}}))throw new Error("Invalid technician");await tx.jobCard.update({where:{id:job.id},data:{diagnosis:String(x.diagnosis||""),notes:String(x.notes||""),laborCost,technicianId:x.technicianId?String(x.technicianId):null}});return validateRecord(tx,"ServiceCase",await tx.serviceCase.update({where:{id:c.id},data:{estimate}}))}
if(x.action==="part"){if(c.status!=="REPAIR"||!c.approvedAt)throw new Error("Parts require approved repair");const qty=Number(x.qty);if(!Number.isSafeInteger(qty)||qty<1||qty>1000000)throw new Error("Invalid quantity");if(!/^[a-zA-Z0-9-]{16,80}$/.test(String(x.requestId||"")))throw new Error("Invalid request reference");const key="repair.part."+String(x.requestId);const prior=await tx.businessSetting.findUnique({where:{key}});if(prior)return {ok:true};const p=await tx.product.findUniqueOrThrow({where:{id:String(x.productId)}});const stock=await tx.stock.findUnique({where:{productId_branchId:{productId:p.id,branchId:String(x.branchId)}}});if(!p.active||!stock||stock.qty-stock.reserved<qty)throw new Error("Insufficient available stock");await tx.stock.update({where:{id:stock.id},data:{qty:{decrement:qty}}});const part=await tx.partUsage.create({data:{jobId:job.id,productId:p.id,qty,cost:p.price}});await tx.businessSetting.create({data:{key,value:part.id}});await tx.auditLog.create({data:{action:"REPAIR_PART_USED",entity:"JobCard",entityId:job.id,after:{productId:p.id,qty,branchId:String(x.branchId)}}});return part}
if(x.action==="invoice"){if(!["READY_FOR_PICKUP","DELIVERED"].includes(c.status)||c.invoices.length)throw new Error("Ready unbilled repair required");const subtotal=c.jobs.reduce((n,j)=>j.parts.reduce((m,p)=>m.add(p.cost.mul(p.qty)),n.add(j.laborCost)),new Prisma.Decimal(0));const rate=decimal(x.taxRate??0);if(rate.gt(100))throw new Error("Invalid tax rate");const tax=subtotal.mul(rate).div(100).toDecimalPlaces(2);return validateRecord(tx,"Invoice",await tx.invoice.create({data:{number:"INV-"+crypto.randomUUID(),customerId:c.customerId,caseId:c.id,subtotal,tax,total:subtotal.add(tax),status:subtotal.add(tax).eq(0)?"PAID":"UNPAID"}}))}
if(x.action!=="advance"||!next[c.status])throw new Error("Invalid repair transition");const status=next[c.status];if(status==="AWAITING_APPROVAL"&&(!job.diagnosis?.trim()||c.estimate===null))throw new Error("Diagnosis and estimate required");if(status==="REPAIR"&&(!job.technicianId||!await tx.staff.findFirst({where:{id:job.technicianId,active:true,role:"TECHNICIAN"}})))throw new Error("Active technician required");if(status==="APPROVED"&&x.confirmApproval!==true)throw new Error("Confirm customer approval");const changed=await tx.serviceCase.updateMany({where:{id:c.id,status:c.status},data:{status,...(status==="APPROVED"?{approvedAt:new Date()}:{})}});if(changed.count!==1)throw new Error("Repair already changed");await validateRecord(tx,"ServiceCase",await tx.serviceCase.findUniqueOrThrow({where:{id:c.id}}));await tx.jobCard.updateMany({where:{caseId:c.id},data:{status,...(status==="DELIVERED"?{deliveredAt:new Date()}:{})}});await tx.auditLog.create({data:{action:"REPAIR_"+status,entity:"ServiceCase",entityId:c.id,before:{status:c.status},after:{status}}});return {status}
},{isolationLevel:"Serializable"});const safeResult=staffUser?(x.action==="part"?(result&&typeof result==="object"&&"id" in result?{id:result.id}:result):filterStaffRecord(staffUser,x.action==="invoice"?"Invoice":"ServiceCase",result)):result;return NextResponse.json(safeResult)}catch(e){return fail(e instanceof Error&&((/^(Validation:|Invalid value:|Unknown field:)| is required$/.test(e.message))||["Invalid amount","Customer, device brand and issue required","Job missing","Diagnosis locked after estimate","Invalid technician","Parts require approved repair","Invalid quantity","Invalid request reference","Insufficient available stock","Ready unbilled repair required","Invalid tax rate","Invalid repair transition","Diagnosis and estimate required","Active technician required","Confirm customer approval","Repair already changed","Field edit permission required"].includes(e.message))?e.message:"Repair operation failed. Check records or retry.",e instanceof Error&&e.message==="Field edit permission required"?403:409)}}
