import {resolveLayout} from "./record-layout";
import {standardCatalog} from "./setup-metadata";
export type Rule={field:string;operator:"required"|"minLength"|"equals";operand:string;message:string;enabled:boolean};
export function validateRules(rules:unknown,values:Record<string,unknown>){if(!Array.isArray(rules))return;for(const r of rules as Rule[]){if(!r.enabled)continue;const v=String(values[r.field]??"");if(r.operator==="required"&&!v.trim()||r.operator==="minLength"&&v.length<Number(r.operand)||r.operator==="equals"&&v!==r.operand)throw Error("Validation: "+r.message)}}
export function recordSections(layout:unknown,keys:string[],required:string[]=[]){return resolveLayout(layout,keys,"Required fields",{hideUnplaced:true,required})}

export const validationEntities = Object.keys(standardCatalog) as (keyof typeof standardCatalog)[];
