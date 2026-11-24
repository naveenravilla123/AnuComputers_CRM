import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInThisContext} from "node:vm";
import ts from "typescript";
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

test("sales list access uses its own object grant and filters related data", () => {
  const workspace = read("src/app/staff/page.tsx");
  for (const [module, object] of [
    ["Customers", "Customer"],
    ["Enquiries", "Lead"],
    ["Quotations", "Quote"],
    ["Sales Orders", "SalesOrder"],
  ]) {
    const entry = workspace.split("\n").find(line => line.includes(`id:"${module}"`));
    assert.ok(entry, `Missing module ${module}`);
    assert.ok(entry.includes(`grants:["${object}:READ"]}`), module);
  }

  for (const [endpoint, object] of [["quotes", "Quote"], ["orders", "SalesOrder"]]) {
    const route = read(`src/app/api/${endpoint}/route.ts`);
    const get = route.split("export async function POST")[0];
    assert.ok(get.includes(`authorizeRequest(r,"${object}","READ")`));
    assert.match(get, /filterStaffResponse\(auth\.access\.user/);
  }
  assert.match(read("src/app/api/orders/route.ts"), /branchByOrder:auth.access.kind==="admin" \|\| auth.access.user.permissions.includes\("Branch:READ"\)/);
});

test("effective permissions use the assigned profile and only assigned permission sets for each staff role", async () => {
  const roles = ["SALES", "TECHNICIAN", "INVENTORY", "FINANCE"];
  for (const role of roles) {
    const settings = new Map(Object.entries({
      [`setup.profile.${role}`]: ["Invoice:READ"],
      [`setup.fieldSecurity.profile.${role}`]: ["Invoice:total:READ"],
      "setup.staffProfile.staff": "custom-profile",
      "setup.customProfile.custom-profile": {role, permissions: ["Customer:READ"]},
      "setup.fieldSecurity.custom.custom-profile": ["Customer:name:READ"],
      "setup.permissionSet.sales-support": {staffIds: ["staff"], permissions: ["SalesOrder:READ"]},
      "setup.fieldSecurity.set.sales-support": ["SalesOrder:status:READ"],
      "setup.permissionSet.unassigned": {staffIds: ["another-user"], permissions: ["Product:DELETE"]},
      "setup.fieldSecurity.set.unassigned": ["Product:cost:READ"],
    }));
    const prisma = {
      staff: {findUnique: async () => ({id: "staff", role, active: true})},
      businessSetting: {
        findUnique: async ({where}) => settings.has(where.key) ? {value: settings.get(where.key)} : null,
        findMany: async ({where}) => [...settings].filter(([key]) => key.startsWith(where.key.startsWith))
          .map(([key, value]) => ({key, value})),
      },
    };
    const exports = {};
    const source = ts.transpileModule(read("src/lib/permissions.ts"), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    }).outputText;
    const initialize = runInThisContext(`(function(exports, require) {${source}\n})`);
    initialize(exports, name => {
      assert.equal(name, "@/lib/prisma");
      return {prisma};
    });

    const custom = await exports.resolveStaffPermissions("staff");
    assert.deepEqual(custom.permissions, ["Customer:READ", "SalesOrder:READ"], role);
    assert.deepEqual(custom.fieldPermissions, ["Customer:name:READ", "SalesOrder:status:READ"], role);

    settings.delete("setup.staffProfile.staff");
    const defaults = await exports.resolveStaffPermissions("staff");
    assert.deepEqual(defaults.permissions, ["Invoice:READ", "SalesOrder:READ"], role);
    assert.deepEqual(defaults.fieldPermissions, ["Invoice:total:READ", "SalesOrder:status:READ"], role);
  }
});

test("sales writes pass the authenticated actor into an isolated database transaction", () => {
  const audit = read("src/lib/sales-audit.ts");
  assert.match(audit, /"staff:" \+ access.user.id/);
  assert.match(audit, /set_config\('anu.record_actor', \$\{actor\}, true\)/);
  assert.match(read("src/lib/standard-records.ts"), /current_setting\('anu.record_actor', true\)/);
  for (const entity of ["customers", "leads", "products", "quotes", "orders"]) {
    assert.match(read(`src/app/api/${entity}/route.ts`), /auditedSalesWrite\(/, entity);
  }
});

test("branch availability preview checks staff field grants and preserves the reservation check", () => {
  const route = read("src/app/api/orders/route.ts");
  assert.match(route, /canReadStaffFields\(staff,[\s\S]*?\["Stock", "qty"\], \["Stock", "reserved"\]/);
  assert.match(route, /for\(const \[productId,qty\] of itemQuantities\(order.items\)\)/);
  assert.match(route, /stock.qty-stock.reserved<qty/);
  assert.match(read("src/components/live-orders.tsx"), /Insufficient stock at the selected branch/);
});
