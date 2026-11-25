import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import ts from "typescript";

function load(path, requireModule = name => { throw Error("Unexpected import " + name); }) {
  const source = readFileSync(new URL("../../" + path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInThisContext(`(function(exports, require) {${compiled}\n})`)(exports, requireModule);
  return exports;
}

const metadata = load("src/lib/setup-metadata.ts");
const catalog = load("src/lib/record-pages.ts", () => metadata);
const recordLayout = load("src/lib/record-layout.ts");
const fieldAccess = load("src/lib/staff-field-access.ts");
const auditDetails = load("src/lib/record-audit-details.ts");

test("Customer 360 uses assigned sections and returns only authorized related fields", async () => {
  const requests = [];
  const permissions = ["Customer:READ", "SalesOrder:READ", "Quote:READ"];
  const fieldPermissions = ["Customer:name:READ", "Customer:createdAt:READ", "Customer:lastModifiedBy:READ", "SalesOrder:number:READ", "Quote:number:READ"];
  const prisma = {
    staff: { findMany: async ({ where }) => {
      assert.deepEqual(where.id.in, ["sales-user"]);
      return [{ id: "sales-user", name: "Sales User" }];
    } },
    customField: { findMany: async () => [{ key: "private_notes", label: "Private notes" }] },
    businessSetting: {
      findUnique: async ({ where }) => where.key.startsWith("record.audit.")
        ? { value: { lastModifiedBy: "staff:sales-user", owner: "staff:private-user" } }
        : { value: { private_notes: "hidden" } },
      findMany: async () => [
        { key: "setup.recordPage.SALES.Customer", value: [{ label: "Role tab", lists: ["orders"] }] },
        { key: "setup.recordPage.custom.sales.Customer", value: [{ label: "My sales", lists: ["orders", "quotes", "invoices"] }] },
      ],
    },
    salesOrder: { findMany: async input => {
      requests.push(input);
      return [{ id: "order-1", number: "SO-1" }];
    } },
  };
  const dependencies = {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/prisma": { prisma },
    "@/lib/request-access": { authorizeRequest: async () => ({
      allowed: true, access: { kind: "staff", user: { id: "sales-user", role: "SALES", profileId: "custom.sales", permissions, fieldPermissions } },
    }) },
    "@/lib/staff-field-access": fieldAccess,
    "@/lib/record-sharing": { canAccessServiceRecord: async () => true },
    "@/lib/record-audit-details": auditDetails,
    "@/lib/standard-records": { auditPrefix: "record.audit.", standardRecords: async () => ({
      rows: [{ id: "customer-1", name: "QA customer", phone: "hidden", createdAt: "2026-11-24T12:00:00Z" }],
    }) },
    "@/lib/effective-layout": { effectiveLayout: async (...args) => {
      assert.deepEqual(args.slice(3), ["SALES", "custom.sales"]);
      return [{ name: "Assigned details", columns: 2, fields: ["name", "phone", "private_notes"] }];
    } },
    "@/lib/record-pages": catalog,
    "@/lib/record-layout": recordLayout,
    "@/lib/setup-metadata": metadata,
    "@/lib/standard-field-overrides": { getStandardOverrides: async () => ({}) },
  };
  const endpoint = load("src/app/api/record-page/route.ts", name => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  });
  const response = await endpoint.GET({ nextUrl: new URL("https://crm.example/api/record-page?entity=Customer&id=customer-1") });
  assert.equal(response.status, 200);
  assert.deepEqual(requests.map(({ where, select }) => ({ where, select })), [
    { where: { customerId: "customer-1" }, select: { id: true, number: true } },
  ]);
  assert.deepEqual(response.body.sections[0].fields, [{ label: "Name", value: "QA customer" }]);
  assert.equal(response.body.sections[0].name, "Assigned details");
  assert.deepEqual(response.body.sections[1], {
    name: "System Information", columns: 2,
    fields: [
      { label: "Created Date", value: "2026-11-24T12:00:00Z" },
      { label: "Last Modified By", value: "Sales User" },
    ],
  });
  assert.deepEqual(response.body.tabs.map(tab => [tab.label, tab.lists.map(list => list.key)]), [["My sales", ["orders"]]]);
});


test("all standard record pages offer every cataloged scalar field and audit field in the default layout", () => {
  const { objectManagerCatalog } = load("src/lib/object-manager-catalog.ts");
  for (const entity of catalog.recordPageObjects) {
    const scalarKeys = objectManagerCatalog[entity].filter(field => !field.type.includes("→")).map(field => field.key);
    const columns = metadata.recordLayoutFields(entity).map(field => field.key);
    const placed = metadata.defaultLayout(entity).sections.flatMap(section => section.fields);
    assert.equal(new Set(placed).size, placed.length, entity);
    for (const key of [...scalarKeys, ...metadata.recordSystemFields.map(field => field.key)]) {
      assert.ok(columns.includes(key), entity + "." + key);
      assert.ok(placed.includes(key), entity + "." + key);
    }
  }
});
