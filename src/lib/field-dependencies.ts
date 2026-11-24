export function layoutUsesField(value:unknown,key:string):boolean {
 const sections=Array.isArray(value)?value:value&&typeof value==="object"&&"sections" in value?(value as {sections:unknown}).sections:null;
 return Array.isArray(sections)&&sections.some(section=>section&&typeof section==="object"&&Array.isArray(section.fields)&&section.fields.includes(key));
}
export function removeFieldGrants(value:unknown,entity:string,key:string):unknown {
 if(!Array.isArray(value))return value;
 const prefix=entity+":"+key+":";
 return value.filter(item=>typeof item!=="string"||!item.startsWith(prefix));
}
