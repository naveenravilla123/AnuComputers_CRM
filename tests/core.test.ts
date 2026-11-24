import {customRecordAudit, parseObjectFields, validateObjectValues} from "../src/lib/custom-object-fields";
import {test} from "node:test";
import assert from "node:assert/strict";
import {Prisma} from "@prisma/client";
import {gstDetails,financialYear} from "../src/lib/gst";
import {resolveLayout} from "../src/lib/record-layout";
import {parseValidationRules} from "../src/lib/validation-configuration";
import {validateRules} from "../src/lib/metadata-runtime";
import {canReadStaffField} from "../src/lib/staff-field-access";
import {effectiveLayout} from "../src/lib/effective-layout";
const d=(n:number)=>new Prisma.Decimal(n);
const gst=(place:string)=>gstDetails(d(45000),d(2000),d(18),"36ABCDE1234F1Z5",place,"");
test("intrastate split",()=>{const x=gst("36");assert.equal(x.snapshot.cgst,"3870.00");assert.equal(x.snapshot.sgst,"3870.00");assert.equal(x.tax.toFixed(2),"7740.00")});
test("interstate tax",()=>{const x=gst("37");assert.equal(x.snapshot.igst,"7740.00");assert.equal(x.snapshot.cgst,"0.00")});
test("invalid GSTIN rejected",()=>assert.throws(()=>gstDetails(d(100),d(0),d(18),"invalid","36","")));
test("Indian fiscal year boundary",()=>{assert.equal(financialYear(new Date("2026-03-31T18:29:59Z")),"2526");assert.equal(financialYear(new Date("2026-03-31T18:30:00Z")),"2627")});
test("layouts ignore obsolete and duplicate fields",()=>assert.deepEqual(resolveLayout([{name:"Main",columns:4,fields:["a","a","deleted"]}],["a","b"]),[{name:"Main",columns:2,fields:["a"]},{name:"Additional details",columns:2,fields:["b"]}]));
test("invalid layout falls back",()=>assert.deepEqual(resolveLayout(null,["a"]),[{name:"Additional details",columns:2,fields:["a"]}]));

test("module rule configuration accepts supported record fields",()=>{
  const rule={field:"total",operator:"required",operand:"",message:"Total is required",enabled:true};
  assert.deepEqual(parseValidationRules("Invoice",[rule],[]),[rule]);
  assert.throws(()=>parseValidationRules("Product",[rule],[]),/Invalid rule/);
});

test("module validation reports the configured message and accepts numeric zero",()=>{
  const rule={field:"cost",operator:"required",operand:"",message:"Enter a cost",enabled:true};
  assert.doesNotThrow(()=>validateRules([rule],{cost:0}));
  assert.throws(()=>validateRules([rule],{}),/Validation: Enter a cost/);
  assert.doesNotThrow(()=>validateRules([{...rule,enabled:false}],{}));
});

test("staff need both object and field read access",()=>{
  const permissions=["JobCard:READ"];
  const fieldPermissions=["JobCard:notes:READ","ServiceCase:issue:READ","JobCard:diagnosis:EDIT"];
  assert.equal(canReadStaffField({permissions,fieldPermissions},"JobCard","notes"),true);
  assert.equal(canReadStaffField({permissions,fieldPermissions},"ServiceCase","issue"),false);
  assert.equal(canReadStaffField({permissions,fieldPermissions},"JobCard","diagnosis"),false);
});

test("staff workspace requests require the explicit staff request marker",async()=>{
 const {isStaffWorkspaceRequest}=await import("../src/lib/staff-request-context");
 const request=(marker?:string)=>new Request("https://crm.test/api/customers",{headers:marker?{"x-anu-workspace":marker}:{}});
 assert.equal(isStaffWorkspaceRequest(request("staff")),true);
 assert.equal(isStaffWorkspaceRequest(request("admin")),false);
 assert.equal(isStaffWorkspaceRequest(request()),false);
});

test("read-only staff grants do not permit customer write actions",async()=>{
 const {hasStaffPermission}=await import("../src/lib/staff-permission-check");
 const {canEditStaffField}=await import("../src/lib/staff-field-access");
 const user={permissions:["Customer:READ"],fieldPermissions:["Customer:name:READ"]};
 assert.equal(hasStaffPermission(user,"Customer","READ"),true);
 assert.equal(hasStaffPermission(user,"Customer","CREATE"),false);
 assert.equal(hasStaffPermission(user,"Customer","EDIT"),false);
 assert.equal(hasStaffPermission(user,"Customer","DELETE"),false);
 assert.equal(canEditStaffField(user,"Customer","name"),false);
});

test("staff edit requires both object edit and field read plus edit grants",async()=>{
 const {assertStaffFieldEdits,canEditStaffField,staffReadableFields}=await import("../src/lib/staff-field-access");
 const user={permissions:["Product:READ","Product:EDIT"],fieldPermissions:["Product:name:READ","Product:name:EDIT","Product:cost:EDIT"]};
 assert.equal(canEditStaffField(user,"Product","name"),true);
 assert.equal(canEditStaffField(user,"Product","cost"),false);
 assert.deepEqual(staffReadableFields(user,"Product",[{key:"name"},{key:"cost"}]),[{key:"name"}]);
 assert.throws(()=>assertStaffFieldEdits(user,"Product",["cost"]),/Field edit permission required/);
 assert.doesNotThrow(()=>assertStaffFieldEdits(user,"Product",["name"]));
 assert.equal(canEditStaffField({...user,permissions:["Product:CREATE"]},"Product","name"),true);
});

test("staff response filtering removes ungranted fields and nested records",async()=>{
 const {filterStaffRecord}=await import("../src/lib/staff-field-access");
 const user={permissions:["SalesOrder:READ","Customer:READ"],fieldPermissions:["SalesOrder:number:READ","Customer:name:READ"]};
 const row={id:"order-1",number:"SO-1",total:120,items:[{id:"item-1",cost:50}],customer:{id:"customer-1",name:"Customer",phone:"secret"}};
 assert.deepEqual(filterStaffRecord(user,"SalesOrder",row),{
  id:"order-1",number:"SO-1",items:[{id:"item-1"}],customer:{id:"customer-1",name:"Customer"},
 });
 assert.equal(filterStaffRecord({...user,permissions:[]},"SalesOrder",row),null);
});

test("profile layout takes priority and a stale assignment falls back to the default",async()=>{
  const profileSections=[{name:"Technician",columns:1,fields:["status"]}];
  const defaultSections=[{name:"Default",columns:2,fields:["status","notes"]}];
  const legacySections=[{name:"Legacy",columns:2,fields:["custom_extra"]}];
  const db=(layoutId:string,withDefault=true)=>({businessSetting:{
    findUnique:async()=>({value:layoutId}),
    findMany:async()=>[
      {key:"setup.namedLayout.JobCard.tech",value:{sections:profileSections}},
      ...(withDefault?[{key:"setup.namedLayout.JobCard.default",value:{sections:defaultSections}}]:[]),
      {key:"setup.layout.JobCard",value:legacySections},
    ],
  }}) as unknown as Parameters<typeof effectiveLayout>[0];
  assert.deepEqual(await effectiveLayout(db("tech"),"JobCard",[],"TECHNICIAN"),profileSections);
  assert.deepEqual(await effectiveLayout(db("stale"),"JobCard",[],"TECHNICIAN"),defaultSections);
  assert.deepEqual((await effectiveLayout(db("stale",false),"JobCard",[],"TECHNICIAN")).slice(1),legacySections);
});

test("custom object field types validate through the shared record validator", () => {
  const samples = [
    ["TEXT", "Acme"], ["TEXTAREA", "First line\nSecond line"], ["NUMBER", 0],
    ["CHECKBOX", false], ["DATE", "2024-02-29"], ["EMAIL", "crm@example.com"],
    ["PHONE", "+91 9876543210"], ["PICKLIST", "Active"],
  ] as const;
  const definitions = parseObjectFields(samples.map(([type]) => ({
    key: type.toLowerCase(), label: type, type, required: true, options: ["Active"],
  })));
  const values = Object.fromEntries(samples.map(([type,value]) => [type.toLowerCase(),value]));
  assert.deepEqual(validateObjectValues(definitions, values), values);
  assert.throws(() => validateObjectValues(definitions, { ...values, date: "2025-02-29" }), /Invalid value: DATE/);
  assert.throws(() => validateObjectValues(definitions, { ...values, picklist: "Unknown" }), /Invalid value: PICKLIST/);
  assert.throws(() => parseObjectFields([{ key: "created_by_id", label: "Duplicate", type: "TEXT" }]), /reserved/);
  assert.deepEqual(validateObjectValues([{key:"flag",label:"Flag",type:"checkbox"}],{flag:false}),{flag:false});
});

test("custom record audit preserves ownership, creator, and creation date on edit", () => {
  const original = customRecordAudit("creator", "2026-01-01T00:00:00.000Z");
  const updated = customRecordAudit("editor", "2026-02-01T00:00:00.000Z", original);
  assert.deepEqual(updated, { ...original, lastModifiedBy: "editor", updatedAt: "2026-02-01T00:00:00.000Z" });
});


test("lookup and additional field types validate their definitions and values", () => {
  const fields = parseObjectFields([
    {key:"parent",label:"Parent",type:"LOOKUP",target:"supplier"},
    {key:"website",label:"Website",type:"URL"},
    {key:"price",label:"Price",type:"CURRENCY"},
    {key:"rate",label:"Rate",type:"PERCENT"},
    {key:"meeting",label:"Meeting",type:"DATETIME"},
  ]);
  const values = {parent:"12345678-1234-1234-1234-123456789abc",website:"https://example.com",price:12.5,rate:5,meeting:"2026-11-22T12:30"};
  assert.deepEqual(validateObjectValues(fields, values), values);
  assert.throws(() => parseObjectFields([{key:"parent",label:"Parent",type:"LOOKUP"}]), /lookup object/);
  assert.throws(() => validateObjectValues(fields, {...values, website:"javascript:alert(1)"}), /Invalid value/);
});


test("layout fields can move between sections and reorder without duplication", async () => {
  const {moveLayoutField}=await import("../src/lib/layout-editor");
  const sections=[{name:"A",columns:2,fields:["a","b","c"]},{name:"B",columns:1,fields:["d"]}];
  assert.deepEqual(moveLayoutField(sections,"a",0,3)[0].fields,["b","c","a"]);
  assert.deepEqual(moveLayoutField(sections,"b",1,0).map(s=>s.fields),[["a","c"],["b","d"]]);
  assert.deepEqual(sections[0].fields,["a","b","c"]);
});


test("layouts hide omitted optional fields while retaining required fields",()=>{
 const sections=[{name:"Main",columns:2,fields:["name"]}];
 assert.deepEqual(resolveLayout(sections,["name","optional","required"],"Required fields",{hideUnplaced:true,required:["required"]}),[{name:"Main",columns:2,fields:["name"]},{name:"Required fields",columns:2,fields:["required"]}]);
 assert.deepEqual(resolveLayout(null,["name"],"Required fields",{hideUnplaced:true}),[{name:"Required fields",columns:2,fields:["name"]}]);
});


test("standard required overrides reject blank values and accept present values",async()=>{
 const {validateStandardOverrides}=await import("../src/lib/standard-field-overrides");
 const db={businessSetting:{findUnique:async()=>({value:{serialNumber:{label:"Serial",required:true}}})}} as unknown as Parameters<typeof validateStandardOverrides>[0];
 await assert.rejects(()=>validateStandardOverrides(db,"Asset",{serialNumber:"   "}),/Serial is required/);
 await assert.doesNotReject(()=>validateStandardOverrides(db,"Asset",{serialNumber:"ABC"}));
});


test("validation import selects custom fields belonging to the configured object",()=>{
 const rule={field:"lead_note__c",operator:"required",operand:"",message:"Required",enabled:true};
 assert.doesNotThrow(()=>parseValidationRules("Lead",[rule],["lead_note__c"]));
 assert.throws(()=>parseValidationRules("Lead",[rule],["customer_note__c"]),/Invalid rule/);
});


test("validation bundle validates each object before performing any writes",async()=>{
 const {importValidationRules}=await import("../src/lib/import-validation-bundle");
 const writes:string[]=[];
 const tx={customField:{findMany:async()=>[{entity:"Customer",key:"customer_note__c"},{entity:"Lead",key:"lead_note__c"}]},businessSetting:{upsert:async(x:{where:{key:string}})=>{writes.push(x.where.key)}},auditLog:{create:async()=>{writes.push("audit")}}} as unknown as Parameters<typeof importValidationRules>[0];
 const rule=(field:string)=>[{field,operator:"required",operand:"",message:"Required",enabled:true}];
 await assert.rejects(()=>importValidationRules(tx,[["Customer",rule("customer_note__c")],["Lead",rule("customer_note__c")]]),/Invalid rule/);
 assert.deepEqual(writes,[]);
 await importValidationRules(tx,[["Customer",rule("customer_note__c")],["Lead",rule("lead_note__c")]]);
 assert.deepEqual(writes,["setup.validation.Customer","setup.validation.Lead","audit"]);
});


test("Asset rules accept their own custom fields and reject unrelated fields",()=>{
 const rule={field:"device_note__c",operator:"required",operand:"",message:"Enter a note",enabled:true};
 assert.doesNotThrow(()=>parseValidationRules("Asset",[rule],["device_note__c"]));
 assert.throws(()=>parseValidationRules("Asset",[rule],["customer_note__c"]),/Invalid rule/);
 assert.throws(()=>validateRules([rule],{}),/Enter a note/);
 assert.doesNotThrow(()=>validateRules([rule],{device_note__c:"ready"}));
});


test("product custom values preserve stored values and validate before saving",async()=>{
 const {saveRecordCustomValues}=await import("../src/lib/save-record-custom-values");
 let saved:unknown;
 const tx={customField:{findMany:async()=>[{key:"code__c",label:"Code",type:"NUMBER",required:true,options:[]},{key:"notes__c",label:"Notes",type:"TEXT",required:false,options:[]}]},businessSetting:{findUnique:async()=>({value:{code__c:4}}),upsert:async(x:{update:{value:unknown}})=>{saved=x.update.value}}} as unknown as Parameters<typeof saveRecordCustomValues>[0];
 await saveRecordCustomValues(tx,"Product","id",undefined);
 assert.deepEqual(saved,{code__c:4});
 saved=undefined;
 await assert.rejects(()=>saveRecordCustomValues(tx,"Product","id",{code__c:"bad"}),/Invalid value/);
 assert.equal(saved,undefined);
 await saveRecordCustomValues(tx,"Product","id",{notes__c:"updated"},{permissions:["Product:EDIT"],fieldPermissions:["Product:notes__c:READ","Product:notes__c:EDIT"]});
 assert.deepEqual(saved,{code__c:4,notes__c:"updated"});
});


test("field dependencies identify saved layouts and remove only matching grants",async()=>{
 const {layoutUsesField,removeFieldGrants}=await import("../src/lib/field-dependencies");
 assert.equal(layoutUsesField({sections:[{fields:["asset__c"]}]},"asset__c"),true);
 assert.equal(layoutUsesField([{fields:["asset__c"]}],"other__c"),false);
 assert.deepEqual(removeFieldGrants(["Asset:asset__c:READ","Asset:asset__c:EDIT","Customer:asset__c:READ","Asset:asset_extra__c:READ"],"Asset","asset__c"),["Customer:asset__c:READ","Asset:asset_extra__c:READ"]);
});

test("staff permission helper requires the exact object action",async()=>{
 const {hasStaffPermission}=await import("../src/lib/staff-permission-check");
 assert.equal(hasStaffPermission({permissions:["Product:READ","Product:EDIT"]},"Product","READ"),true);
 assert.equal(hasStaffPermission({permissions:["Product:READ"]},"Product","EDIT"),false);
 assert.equal(hasStaffPermission(null,"Product","READ"),false);
});
