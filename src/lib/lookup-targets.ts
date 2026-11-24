import type {Prisma} from "@prisma/client";
import {isStandardObject,standardRecords} from "./standard-records";
export async function lookupTargetExists(db:Prisma.TransactionClient,target:string) {
  return isStandardObject(target) || !!await db.businessSetting.findUnique({where:{key:"setup.customObject."+target}});
}
export async function lookupRecordExists(db:Prisma.TransactionClient,target:string,id:string) {
  if(isStandardObject(target)) return (await standardRecords(db,target,id,"",0)).rows.length>0;
  return !!await db.businessSetting.findUnique({where:{key:"custom.record."+target+"."+id}});
}
export async function validateLookupTargets(db:Prisma.TransactionClient,fields:{key:string;label:string;type:string;options?:unknown}[],values:Record<string,unknown>) {
  for(const field of fields){const value=values[field.key];if(field.type!=="LOOKUP"||!value)continue;const target=Array.isArray(field.options)?field.options[0]:null;if(typeof target!=="string"||typeof value!=="string"||!await lookupRecordExists(db,target,value))throw Error("Invalid value: "+field.label)}
}
