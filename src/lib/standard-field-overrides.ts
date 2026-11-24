import type {Prisma} from "@prisma/client";
export const editableStandardFields:Record<string,Record<string,boolean>>={Customer:{name:true,phone:true,email:false,address:false,source:true},Asset:{customerId:true,brand:true,model:false,serialNumber:false},Lead:{name:true,phone:false,source:true,interest:false,stage:true},Product:{name:true,sku:true,category:true,brand:false,price:true,cost:true,active:true},Supplier:{name:true,phone:false,email:false,gstin:false}};
export type StandardFieldOverride={label:string;required:boolean};
export async function getStandardOverrides(db:Prisma.TransactionClient,entity:string):Promise<Record<string,StandardFieldOverride>> {
 const row=await db.businessSetting.findUnique({where:{key:"setup.standardFields."+entity}});
 return row?.value&&typeof row.value==="object"&&!Array.isArray(row.value)?row.value as Record<string,StandardFieldOverride>:{};
}
export async function validateStandardOverrides(db:Prisma.TransactionClient,entity:string,record:Record<string,unknown>) {
 const configs=await getStandardOverrides(db,entity);
 for(const [key,option] of Object.entries(configs)) if(Object.prototype.hasOwnProperty.call(editableStandardFields[entity]??{},key)&&option?.required&&(record[key]===null||record[key]===undefined||typeof record[key]==="string"&&!String(record[key]).trim())) throw Error("Validation: "+option.label+" is required");
}
