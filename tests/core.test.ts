import {test} from "node:test";
import assert from "node:assert/strict";
import {Prisma} from "@prisma/client";
import {gstDetails,financialYear} from "../src/lib/gst";
import {resolveLayout} from "../src/lib/record-layout";
import {parseValidationRules} from "../src/lib/validation-configuration";
import {validateRules} from "../src/lib/metadata-runtime";
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
