import type {Prisma} from "@prisma/client";
import {validateCustom} from "./custom-validation";
import {validateLookupTargets} from "./lookup-targets";
import {assertStaffFieldEdits} from "./staff-field-access";
type StaffFieldAccess={permissions:string[];fieldPermissions:string[]};
export async function saveNewCustomValues(tx:Prisma.TransactionClient,entity:string,id:string,input:unknown,staff?:StaffFieldAccess){
 if(input===undefined)input={};
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("Validation: Invalid custom values");
 const fields=await tx.customField.findMany({where:{entity}});
 if(staff)assertStaffFieldEdits(staff,entity,Object.keys(input));
 const values=validateCustom(fields,{...Object.fromEntries(fields.filter(f=>f.type==="CHECKBOX").map(f=>[f.key,false])),...input});
 await validateLookupTargets(tx,fields,values);
 const key="custom.values."+entity+"."+id;
 await tx.businessSetting.create({data:{key,value:values}});
}
