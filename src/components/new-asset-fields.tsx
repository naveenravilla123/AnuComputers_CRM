"use client";
import {useEffect,useState} from "react";
import type {ReactNode} from "react";
import MetadataFields,{type Field,type Values} from "./metadata-fields";
import {fieldLabel,standardCatalog} from "@/lib/setup-metadata";
type Overrides=Record<string,{label:string;required:boolean}>;
const fieldTypes:Record<string,string>={String:"TEXT",Decimal:"CURRENCY",Int:"NUMBER",Boolean:"CHECKBOX",DateTime:"DATETIME",Json:"TEXTAREA"};
export function useNewRecordFields(entity:string,enabled=true){
 const [fields,setFields]=useState<Field[]|null>(null),[sections,setSections]=useState<unknown>(null),[standardFields,setStandardFields]=useState<string[]>([]),[standardEditable,setStandardEditable]=useState<Record<string,boolean>>({}),[standardOverrides,setStandardOverrides]=useState<Overrides>({}),[values,setValues]=useState<Values>({}),[error,setError]=useState("");
 useEffect(()=>{if(!enabled){setFields([]);setSections(null);setStandardFields([]);setStandardEditable({});setStandardOverrides({});setValues({});setError("");return}const controller=new AbortController();setFields(null);setStandardFields([]);setStandardEditable({});setStandardOverrides({});setValues({});setError("");fetch("/api/record-metadata?entity="+encodeURIComponent(entity),{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);setFields(data.fields);setSections(data.sections);setStandardFields(data.standardFields??[]);setStandardEditable(data.standardEditable??{});setStandardOverrides(data.standardOverrides??{})}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[entity,enabled]);
 return {entity,fields,sections,standardFields,standardEditable,standardOverrides,values,setValues,error};
}
export function useNewAssetFields(includeRepairFields=false){
 const asset=useNewRecordFields("Asset"),serviceCase=useNewRecordFields("ServiceCase",includeRepairFields),jobCard=useNewRecordFields("JobCard",includeRepairFields);
 return {...asset,fields:includeRepairFields&&(serviceCase.fields===null||jobCard.fields===null)?null:asset.fields,repair:includeRepairFields?{serviceCase,jobCard}:null};
}
export function NewRecordFields({state,standardValues,onStandardChange,renderStandardField}:{state:ReturnType<typeof useNewRecordFields>;standardValues?:Values;onStandardChange?:(key:string,value:string|number|boolean)=>void;renderStandardField?:(field:Field)=>ReactNode|null}){
 const standard=standardValues?state.standardFields.flatMap(key=>{const definition=standardCatalog[state.entity]?.find(field=>field.key===key);return definition?[{key,label:state.standardOverrides[key]?.label||fieldLabel(key),type:fieldTypes[definition.type]||"TEXT",required:state.standardOverrides[key]?.required??definition.required,editable:state.standardEditable[key]??true}]:[]}):[];
 const fields=state.fields?[...standard,...state.fields]:null;
 return <>{state.error&&<p role="alert">{state.error}</p>}{fields&&fields.length>0&&<MetadataFields fields={fields} sections={state.sections} values={{...standardValues,...state.values}} onChange={(key,value)=>{if(state.fields?.some(field=>field.key===key))state.setValues(previous=>({...previous,[key]:value}));else onStandardChange?.(key,value)}} renderCustomField={field=>standard.some(standardField=>standardField.key===field.key)?renderStandardField?.(field)??null:null}/>}</>;
}
export function NewAssetFields({state}:{state:ReturnType<typeof useNewAssetFields>}){
 return <><NewRecordFields state={state}/>{state.repair&&<div className="space-y-4 rounded-lg border-t pt-4"><h3 className="font-semibold">Service case fields</h3><NewRecordFields state={state.repair.serviceCase}/><h3 className="font-semibold">Repair task fields</h3><NewRecordFields state={state.repair.jobCard}/></div>}</>;
}
