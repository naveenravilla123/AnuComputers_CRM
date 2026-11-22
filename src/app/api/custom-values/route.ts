import {effectiveLayout} from "@/lib/effective-layout";
import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {validSession} from "@/lib/session";
import {validateCustom} from "@/lib/custom-validation";
import {validateRules} from "@/lib/metadata-runtime";
import {Prisma} from "@prisma/client";
export const dynamic="force-dynamic";
const entities=["Customer","Lead","Product","SalesOrder","Quote","ServiceCase","JobCard","Asset","Invoice","Supplier","Stock","PurchaseOrder","Payment"];
async function findRecord(tx:Prisma.TransactionClient,entity:string,id:string){switch(entity){case "Customer":return tx.customer.findUnique({where:{id}});case "Lead":return tx.lead.findUnique({where:{id}});case "Product":return tx.product.findUnique({where:{id}});case "SalesOrder":return tx.salesOrder.findUnique({where:{id}});case "Quote":return tx.quote.findUnique({where:{id}});case "ServiceCase":return tx.serviceCase.findUnique({where:{id}});case "JobCard":return tx.jobCard.findUnique({where:{id}});case "Asset":return tx.asset.findUnique({where:{id}});case "Invoice":return tx.invoice.findUnique({where:{id}});case "Supplier":return tx.supplier.findUnique({where:{id}});case "Stock":return tx.stock.findUnique({where:{id}});case "PurchaseOrder":return tx.purchaseOrder.findUnique({where:{id}});case "Payment":return tx.payment.findUnique({where:{id}});default:return null}}
const editableNames = new Set(["Customer", "Lead", "Product", "Supplier"]);

async function updateName(tx: Prisma.TransactionClient, entity: string, id: string, name: string) {
  const args = { where: { id }, data: { name } };
  switch (entity) {
    case "Customer": return tx.customer.update(args);
    case "Lead": return tx.lead.update(args);
    case "Product": return tx.product.update(args);
    case "Supplier": return tx.supplier.update(args);
    default: throw Error("Invalid record name");
  }
}

const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(r:NextRequest){if(!await validSession(r.cookies.get("anu_session")?.value))return fail("Unauthorized",401);const entity=r.nextUrl.searchParams.get("entity")||"",id=r.nextUrl.searchParams.get("id")||"";if(!entities.includes(entity)||!id)return fail("Invalid record");try{const record=await findRecord(prisma,entity,id);if(!record)return fail("Record not found",404);const [fields,row,history]=await Promise.all([prisma.customField.findMany({where:{entity},orderBy:{label:"asc"}}),prisma.businessSetting.findUnique({where:{key:"custom.values."+entity+"."+id}}),prisma.auditLog.findMany({where:{action:"CUSTOM_VALUES_UPDATED",entity,entityId:id},orderBy:{at:"desc"},take:20,select:{id:true,at:true,actorId:true,before:true,after:true}})]);const layout=await effectiveLayout(prisma,entity,fields.map(field=>field.key));return NextResponse.json({fields,values:row?.value||{},layout,history,name:editableNames.has(entity)&&"name" in record?record.name:null},{headers:{"Cache-Control":"no-store"}})}catch{return fail("Unable to load fields",503)}}
export async function POST(r:NextRequest){if(!await validSession(r.cookies.get("anu_session")?.value))return fail("Unauthorized",401);if(r.headers.get("origin")!==r.nextUrl.origin)return fail("Invalid origin",403);try{const x=await r.json(),entity=String(x.entity),id=String(x.id);if(!entities.includes(entity)||!id||!x.values||typeof x.values!=="object"||Array.isArray(x.values))return fail("Invalid record or values");await prisma.$transaction(async tx=>{const record=await findRecord(tx,entity,id);if(!record)throw Error("Record not found");const fields=await tx.customField.findMany({where:{entity}}),value:Record<string,Prisma.InputJsonValue>={};Object.assign(value,validateCustom(fields,x.values));const rule=await tx.businessSetting.findUnique({where:{key:"setup.validation."+entity}});const oldName = "name" in record ? record.name : undefined;
const name = x.name === undefined ? undefined : typeof x.name === "string" ? x.name.trim() : "";
if(name!==undefined && (!editableNames.has(entity)||!name||name.length>150))throw Error("Invalid record name");
const renamed = name!==undefined && name!==oldName;
validateRules(rule?.value,{...record,...value,...(renamed?{name}:{})});const key="custom.values."+entity+"."+id;const previous=await tx.businessSetting.findUnique({where:{key}});const old=previous?.value;const prior=old&&typeof old==="object"&&!Array.isArray(old)?old:{};const changed=fields.filter(field=>(prior[field.key]??null)!==(value[field.key]??null));
if(!changed.length&&!renamed)return;
if(renamed)await updateName(tx,entity,id,name);
await tx.businessSetting.upsert({where:{key},create:{key,value},update:{value}});
await tx.auditLog.create({data:{action:"CUSTOM_VALUES_UPDATED",entity,entityId:id,actorId:process.env.CRM_ADMIN_EMAIL?.trim().toLowerCase()||null,
  before:{...Object.fromEntries(changed.map(field=>[field.key,prior[field.key]??null])),...(renamed?{name:oldName??null}:{})},
  after:{values:{...Object.fromEntries(changed.map(field=>[field.key,value[field.key]??null])),...(renamed?{name}:{})}},
}})},{isolationLevel:"Serializable"});return NextResponse.json({ok:true})}catch(e){const m=e instanceof Error?e.message:"";return fail(/^(Record not found|Unknown field:|Invalid value:|Invalid record name|Validation:)| is required$/.test(m)?m:"Unable to save values",409)}}
