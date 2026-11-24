import type {Prisma} from "@prisma/client";
import {validationEntities} from "./metadata-runtime";
import {parseValidationRules} from "./validation-configuration";
export async function importValidationRules(tx:Prisma.TransactionClient,entries:[string,unknown][]) {
 const fields=await tx.customField.findMany({where:{entity:{in:[...validationEntities]}}});
 const rules=entries.map(([entity,value])=>({entity,value:parseValidationRules(entity,value,fields.filter(field=>field.entity===entity).map(field=>field.key))}));
 for(const entry of rules){const key="setup.validation."+entry.entity;await tx.businessSetting.upsert({where:{key},create:{key,value:entry.value},update:{value:entry.value}})}
 await tx.auditLog.create({data:{action:"SETUP_VALIDATION_IMPORTED",entity:"CRMSetup",entityId:"anu-crm-validation",after:{objects:rules.map(rule=>rule.entity)}}});
}
