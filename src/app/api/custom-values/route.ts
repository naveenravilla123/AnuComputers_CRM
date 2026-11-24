import {canAccessServiceRecord} from "@/lib/record-sharing";
import {validateStandardOverrides} from "@/lib/standard-field-overrides";
import {validateLookupTargets} from "@/lib/lookup-targets";
import {effectiveLayout} from "@/lib/effective-layout";
import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {validSession} from "@/lib/session";
import {validateCustom} from "@/lib/custom-validation";
import {validateRules} from "@/lib/metadata-runtime";
import {Prisma} from "@prisma/client";
import {authorizeRequest} from "@/lib/request-access";
import {assertStaffFieldEdits,canEditStaffField,staffReadableFields} from "@/lib/staff-field-access";
import {permissionObjects} from "@/lib/permissions";
export const dynamic="force-dynamic";
const entities=["Customer","Lead","Product","SalesOrder","Quote","ServiceCase","JobCard","Asset","Invoice","Supplier","Stock","PurchaseOrder","Payment","Branch"];
async function findRecord(tx:Prisma.TransactionClient,entity:string,id:string){switch(entity){case "Customer":return tx.customer.findUnique({where:{id}});case "Lead":return tx.lead.findUnique({where:{id}});case "Product":return tx.product.findUnique({where:{id}});case "SalesOrder":return tx.salesOrder.findUnique({where:{id}});case "Quote":return tx.quote.findUnique({where:{id}});case "ServiceCase":return tx.serviceCase.findUnique({where:{id}});case "JobCard":return tx.jobCard.findUnique({where:{id}});case "Asset":return tx.asset.findUnique({where:{id}});case "Invoice":return tx.invoice.findUnique({where:{id}});case "Supplier":return tx.supplier.findUnique({where:{id}});case "Stock":return tx.stock.findUnique({where:{id}});case "PurchaseOrder":return tx.purchaseOrder.findUnique({where:{id}});case "Payment":return tx.payment.findUnique({where:{id}});case "Branch":return tx.branch.findUnique({where:{id}});default:return null}}
const editableNames = new Set(["Customer", "Lead", "Product", "Supplier", "Branch"]);

async function updateName(tx: Prisma.TransactionClient, entity: string, id: string, name: string) {
  const args = { where: { id }, data: { name } };
  switch (entity) {
    case "Customer": return tx.customer.update(args);
    case "Lead": return tx.lead.update(args);
    case "Product": return tx.product.update(args);
    case "Supplier": return tx.supplier.update(args);
    case "Branch": return tx.branch.update(args);
    default: throw Error("Invalid record name");
  }
}

const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(r:NextRequest){const entity=r.nextUrl.searchParams.get("entity")||"",id=r.nextUrl.searchParams.get("id")||"";if(!entities.includes(entity)||!id)return fail("Invalid record");const auth=await authorizeRequest(r,entity as typeof permissionObjects[number],"READ");if(!auth.allowed)return fail(auth.status===401?"Unauthorized":"Forbidden",auth.status);try{if(auth.access.kind==="staff"&&!await canAccessServiceRecord(prisma,auth.access.user,entity,id))return fail("Forbidden",403);const record=await findRecord(prisma,entity,id);if(!record)return fail("Record not found",404);const [allFields,row,history]=await Promise.all([prisma.customField.findMany({where:{entity},orderBy:{label:"asc"}}),prisma.businessSetting.findUnique({where:{key:"custom.values."+entity+"."+id}}),prisma.auditLog.findMany({where:{action:"CUSTOM_VALUES_UPDATED",entity,entityId:id},orderBy:{at:"desc"},take:20,select:{id:true,at:true,actorId:true,before:true,after:true}})]);const staff=auth.access.kind==="staff"?auth.access.user:null;const readable=staff?staffReadableFields(staff,entity,allFields):allFields;const fields=readable.map(field=>({...field,editable:!staff||canEditStaffField(staff,entity,field.key)}));const raw=row?.value&&typeof row.value==="object"&&!Array.isArray(row.value)?row.value as Record<string,unknown>:{};const values=staff?Object.fromEntries(fields.filter(field=>Object.prototype.hasOwnProperty.call(raw,field.key)).map(field=>[field.key,raw[field.key]])):raw;const layout=await effectiveLayout(prisma,entity,fields.map(field=>field.key),staff?.role,staff?.profileId);const visibleHistory=staff?history.map(entry=>{const before=entry.before&&typeof entry.before==="object"&&!Array.isArray(entry.before)?entry.before as Record<string,unknown>:{};const after=entry.after&&typeof entry.after==="object"&&!Array.isArray(entry.after)?entry.after as Record<string,unknown>:{};const afterValues=after.values&&typeof after.values==="object"&&!Array.isArray(after.values)?after.values as Record<string,unknown>:{};return {...entry,before:Object.fromEntries(fields.map(field=>field.key).filter(key=>Object.prototype.hasOwnProperty.call(before,key)).map(key=>[key,before[key]])),after:{values:Object.fromEntries(fields.map(field=>field.key).filter(key=>Object.prototype.hasOwnProperty.call(afterValues,key)).map(key=>[key,afterValues[key]]))}}}):history;const canReadName=editableNames.has(entity)&&"name" in record&&(!staff||staffReadableFields(staff,entity,[{key:"name"}]).length>0);return NextResponse.json({fields,values,layout,history:visibleHistory,name:canReadName?record.name:null,nameEditable:canReadName&&(!staff||canEditStaffField(staff,entity,"name"))},{headers:{"Cache-Control":"no-store"}})}catch{return fail("Unable to load fields",503)}}
export async function POST(r:NextRequest){if(r.headers.get("origin")!==r.nextUrl.origin)return fail("Invalid origin",403);try{const x=await r.json(),entity=String(x.entity),id=String(x.id);if(!entities.includes(entity)||!id||!x.values||typeof x.values!=="object"||Array.isArray(x.values))return fail("Invalid record or values");const auth=await authorizeRequest(r,entity as typeof permissionObjects[number],"EDIT");if(!auth.allowed)return fail(auth.status===401?"Unauthorized":"Forbidden",auth.status);await prisma.$transaction(async tx=>{if(auth.access.kind==="staff"&&!await canAccessServiceRecord(tx,auth.access.user,entity,id))throw Error("Record access required");const record=await findRecord(tx,entity,id);if(!record)throw Error("Record not found");const fields=await tx.customField.findMany({where:{entity}});const input=x.values as Record<string,unknown>;if(auth.access.kind==="staff")assertStaffFieldEdits(auth.access.user,entity,Object.keys(input));const key="custom.values."+entity+"."+id;const previous=await tx.businessSetting.findUnique({where:{key}});const old=previous?.value;const prior=old&&typeof old==="object"&&!Array.isArray(old)?old as Record<string,unknown>:{};const value:Record<string,Prisma.InputJsonValue>={};Object.assign(value,validateCustom(fields,{...prior,...input}));await validateLookupTargets(tx,fields,value);const rule=await tx.businessSetting.findUnique({where:{key:"setup.validation."+entity}});const oldName = "name" in record ? record.name : undefined;
const name = x.name === undefined ? undefined : typeof x.name === "string" ? x.name.trim() : "";
if(name!==undefined && (!editableNames.has(entity)||!name||name.length>150))throw Error("Invalid record name");
if(name!==undefined&&auth.access.kind==="staff")assertStaffFieldEdits(auth.access.user,entity,["name"]);
const renamed = name!==undefined && name!==oldName;
await validateStandardOverrides(tx,entity,{...record,...(renamed?{name}:{})});
validateRules(rule?.value,{...record,...value,...(renamed?{name}:{})});const changed=fields.filter(field=>(prior[field.key]??null)!==(value[field.key]??null));
if(!changed.length&&!renamed)return;
if(renamed)await updateName(tx,entity,id,name);
await tx.businessSetting.upsert({where:{key},create:{key,value},update:{value}});
await tx.auditLog.create({data:{action:"CUSTOM_VALUES_UPDATED",entity,entityId:id,actorId:process.env.CRM_ADMIN_EMAIL?.trim().toLowerCase()||null,
  before:{...Object.fromEntries(changed.map(field=>[field.key,prior[field.key]??null])),...(renamed?{name:oldName??null}:{})},
  after:{values:{...Object.fromEntries(changed.map(field=>[field.key,value[field.key]??null])),...(renamed?{name}:{})}},
}})},{isolationLevel:"Serializable"});return NextResponse.json({ok:true})}catch(e){const m=e instanceof Error?e.message:"";return fail(m==="Record access required"||m==="Field edit permission required"?"Forbidden":/^(Record not found|Unknown field:|Invalid value:|Invalid record name|Validation:)| is required$/.test(m)?m:"Unable to save values",m==="Record access required"||m==="Field edit permission required"?403:409)}}
