import type {LayoutSection} from "./record-layout";
export function moveLayoutField(sections:LayoutSection[],key:string,to:number,index?:number):LayoutSection[] {
  if(!sections[to] || !key) return sections;
  const result=sections.map(section=>({...section,fields:section.fields.filter(field=>field!==key)}));
  const original=sections[to].fields;
  const adjusted=index===undefined?result[to].fields.length:Math.max(0,Math.min(result[to].fields.length,index-(original.indexOf(key)>=0&&original.indexOf(key)<index?1:0)));
  result[to].fields.splice(adjusted,0,key);
  return result;
}
