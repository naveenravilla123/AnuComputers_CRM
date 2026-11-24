import type {Prisma} from "@prisma/client";
import {validateCustom} from "./custom-validation";
import {validateLookupTargets} from "./lookup-targets";
import {assertStaffFieldEdits} from "./staff-field-access";
type StaffFieldAccess={permissions:string[];fieldPermissions:string[]};
export async function saveRecordCustomValues(tx:Prisma.TransactionClient,entity:string,id:string,input:unknown,staff?:StaffFieldAccess) {
 const fields=await tx.customField.findMany({where:{entity}});
 const key="custom.values."+entity+"."+id;
 const prior=await tx.businessSetting.findUnique({where:{key}});
 const previous=prior?.value&&typeof prior.value==="object"&&!Array.isArray(prior.value)?prior.value as Record<string,unknown>:{};
 const raw=input===undefined?previous:input;
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Validation: Invalid custom values");
 if(staff&&input!==undefined)assertStaffFieldEdits(staff,entity,Object.keys(input as Record<string,unknown>));
 const values=validateCustom(fields,{...Object.fromEntries(fields.filter(f=>f.type==="CHECKBOX").map(f=>[f.key,false])),...previous,...raw});
 await validateLookupTargets(tx,fields,values);
 await tx.businessSetting.upsert({where:{key},create:{key,value:values},update:{value:values}});
}
