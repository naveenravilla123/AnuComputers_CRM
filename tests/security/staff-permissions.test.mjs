import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
test("repair APIs scope case lists and writes to shared jobs",()=>{
 const s=read("src/app/api/repairs/route.ts");
 assert.match(s,/accessibleJobIds\(prisma,auth.access.user\)/);
 assert.match(s,/canAccessServiceCase\(prisma,staffUser/);
 assert.match(s,/serviceCase.findMany\(\{where:scopedIds/);
});
test("service history and custom values prevent bypass",()=>{
 assert.match(read("src/app/api/repairs/history/route.ts"),/canAccessServiceCase\(prisma/);
 assert.match(read("src/app/api/custom-values/route.ts"),/canAccessServiceRecord\(tx/);
 assert.match(read("src/app/api/custom-values/route.ts"),/403:409/);
});
test("field filtering and permission-set grants remain in place",()=>{
 assert.match(read("src/lib/staff-field-access.ts"),/canReadStaffField/);
 assert.match(read("src/lib/permissions.ts"),/setup.fieldSecurity.set/);
 assert.match(read("src/lib/request-access.ts"),/staff.permissions.includes/);
});
test("admin-only setup and staff deactivation enforced",()=>{
 assert.match(read("src/app/api/setup/route.ts"),/validSession/);
 assert.match(read("src/app/api/staff-accounts/route.ts"),/active:action==="enable"/);
});
test("raw after-sales records not exposed to staff",()=>{
 assert.match(read("src/app/api/after-sales/route.ts"),/Staff after-sales history requires a record-scoped implementation/);
});
