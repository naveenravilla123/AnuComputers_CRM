import {auditedSalesWrite} from "@/lib/sales-audit";
import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {prisma} from "@/lib/prisma";
import {authorizeAll,authorizeRequest} from "@/lib/request-access";
import {assertStaffFieldEdits,canReadStaffFields,filterStaffResponse,filterStaffRecord} from "@/lib/staff-field-access";
import {saveNewCustomValues} from "@/lib/new-custom-values";
import {validateRecord} from "@/lib/record-validation";
export const dynamic="force-dynamic";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(r:NextRequest){const auth=await authorizeRequest(r,"Quote","READ");if(!auth.allowed)return fail(auth.status===401?"Unauthorized":"Forbidden",auth.status);try{const [leads,products,quotes]=await Promise.all([prisma.lead.findMany({include:{customer:true}}),prisma.product.findMany({where:{active:true},select:{id:true,name:true,sku:true,price:true}}),prisma.quote.findMany({include:{lead:{include:{customer:true}},items:{include:{product:true}}},orderBy:{number:"desc"}})]);const result={leads,products,quotes};return NextResponse.json(auth.access.kind==="staff"?filterStaffResponse(auth.access.user,result,{leads:"Lead",products:"Product",quotes:"Quote"}):result,{headers:{"Cache-Control":"no-store"}})}catch{return fail("Database unavailable",503)}}
export async function POST(r:NextRequest){
 if(r.headers.get("origin")!==r.nextUrl.origin)return fail("Invalid origin",403);
 try{
  const x=await r.json();
  const requirements=x.action==="create"
   ?[{object:"Quote" as const,action:"CREATE" as const},{object:"Lead" as const,action:"READ" as const},{object:"Product" as const,action:"READ" as const}]
   :x.action==="convert"
    ?[{object:"Quote" as const,action:"EDIT" as const},{object:"SalesOrder" as const,action:"CREATE" as const}]
    :[{object:"Quote" as const,action:"EDIT" as const}];
  const auth=await authorizeAll(r,requirements);
  if(!auth.allowed)return fail(auth.status===401?"Unauthorized":"Forbidden",auth.status);
  const staff=auth.access.kind==="staff"?auth.access.user:undefined;
  if(staff&&x.action==="create")assertStaffFieldEdits(staff,"Quote",["number","leadId","status","total","expiresAt"]);
  else if(staff&&x.action==="convert"){
   assertStaffFieldEdits(staff,"Quote",["status"]);
   assertStaffFieldEdits(staff,"SalesOrder",["number","customerId","status","total"]);
   if(!canReadStaffFields(staff,[["Quote","status"],["Quote","leadId"]]))return fail("Forbidden",403);
  }else if(staff)assertStaffFieldEdits(staff,"Quote",x.action==="editExpiry"?["expiresAt"]:["status"]);
  if (x.action === "editExpiry") {
    const input = x.expiresAt;
    if (typeof input !== "string" || !x.id) return fail("Quotation and expiry date required");
    const expiresAt = input ? new Date(input + "T23:59:59+05:30") : null;
    if (expiresAt && (!/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.toISOString().slice(0, 10) !== input || expiresAt <= new Date())) return fail("Invalid expiry date");
    const updated = await auditedSalesWrite(auth.access, async tx => {
      const changed = await tx.quote.updateMany({ where: { id: String(x.id), status: "DRAFT" }, data: { expiresAt } });
      if (!changed.count) return null;
      const quote = await tx.quote.findUniqueOrThrow({ where: { id: String(x.id) } });
      await validateRecord(tx, "Quote", quote);
      await tx.auditLog.create({ data: { action: "QUOTE_EDIT_EXPIRY", entity: "Quote", entityId: quote.id,
        after: { expiresAt: expiresAt?.toISOString() ?? null } } });
      return quote;
    }, { isolationLevel: "Serializable" });
    if (!updated) return fail("Only draft quotations can be edited", 409);
    return NextResponse.json(staff ? filterStaffRecord(staff, "Quote", updated) : updated);
  }
  if(x.action==="create"){
   if(!x.leadId||!Array.isArray(x.items)||!x.items.length||x.items.length>100)return fail("Select a lead and 1–100 products");
   const items=x.items.map((i:any)=>{if(!i.productId||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>1000000||!/^\d{1,10}(\.\d{1,2})?$/.test(String(i.unitPrice)))throw new Error("Invalid line item");return {productId:String(i.productId),qty:i.qty,unitPrice:new Prisma.Decimal(String(i.unitPrice))}});
   const total=items.reduce((n:Prisma.Decimal,i:{qty:number;unitPrice:Prisma.Decimal})=>n.add(i.unitPrice.mul(i.qty)),new Prisma.Decimal(0));
   const expiresAt=x.expiresAt?new Date(String(x.expiresAt)+"T23:59:59+05:30"):null;
   if(expiresAt&&(!Number.isFinite(expiresAt.getTime())||expiresAt<=new Date()))return fail("Invalid expiry date");
   const created=await auditedSalesWrite(auth.access,async tx=>{const quote=await tx.quote.create({data:{number:"QT-"+crypto.randomUUID(),leadId:String(x.leadId),expiresAt,total,items:{create:items}}});await saveNewCustomValues(tx,"Quote",quote.id,x.customValues,staff);return validateRecord(tx,"Quote",quote)},{isolationLevel:"Serializable"});
   return NextResponse.json(staff?filterStaffRecord(staff,"Quote",created):created,{status:201});
  }
const transitions:Record<string,string[]>={SENT:["DRAFT"],APPROVED:["SENT"],REJECTED:["SENT"],CANCELLED:["DRAFT","SENT"]};
const result=await auditedSalesWrite(auth.access,async tx=>{const id=String(x.id||"");const q=await tx.quote.findUniqueOrThrow({where:{id},include:{lead:true,items:true}});if(x.action==="convert"){if(q.status!=="APPROVED"||!q.lead?.customerId)throw new Error("Approved quotation and converted customer required");if(q.expiresAt&&q.expiresAt<new Date())throw new Error("Quotation expired");const changed=await tx.quote.updateMany({where:{id,status:"APPROVED"},data:{status:"CONVERTED"}});if(changed.count!==1)throw new Error("Quotation already processed");const order=await tx.salesOrder.create({data:{number:"SO-"+crypto.randomUUID(),customerId:q.lead.customerId,total:q.total,items:{create:q.items.map(i=>({productId:i.productId,qty:i.qty,unitPrice:i.unitPrice}))}}});await tx.auditLog.create({data:{action:"QUOTE_CONVERTED",entity:"Quote",entityId:id,after:{orderId:order.id}}});return {orderId:order.id,number:order.number}}
const status=String(x.status||"");if(!transitions[status]?.includes(q.status))throw new Error("Invalid status transition");if(["SENT","APPROVED"].includes(status)&&q.expiresAt&&q.expiresAt<new Date())throw new Error("Quotation expired");const changed=await tx.quote.updateMany({where:{id,status:q.status},data:{status}});if(changed.count!==1)throw new Error("Quotation already processed");await tx.auditLog.create({data:{action:"QUOTE_"+status,entity:"Quote",entityId:id,after:{status}}});return {status}},{isolationLevel:"Serializable"});return NextResponse.json(result)}catch(e){return fail(e instanceof Error&&e.message==="Field edit permission required"?"Forbidden: field edit permission required":e instanceof Error&&["Invalid line item","Approved quotation and converted customer required","Quotation expired","Quotation already processed","Invalid status transition"].includes(e.message)?e.message:"Quotation operation failed. Check records or retry.",e instanceof Error&&e.message==="Field edit permission required"?403:409)}}
