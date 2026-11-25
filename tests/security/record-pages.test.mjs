import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext, runInThisContext } from "node:vm";
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
  const fieldPermissions = ["Customer:name:READ", "Customer:id:READ", "Customer:createdAt:READ", "Customer:lastModifiedBy:READ", "SalesOrder:number:READ", "Quote:number:READ"];
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
      return [{ name: "Assigned details", columns: 2, fields: ["name", "id", "phone", "private_notes"] }];
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


test("CRM URLs preserve selected modules, Setup sections, and nested record tabs", () => {
  const path = new URL("https://crm.example/staff");
  const events = new EventTarget();
  const entries = [{ url: path.href, state: null }];
  let index = 0;
  const history = {
    get state() { return entries[index].state; },
    pushState(state, _title, url) {
      entries.splice(++index, entries.length, { url: url.href, state });
    },
    back() { index--; events.dispatchEvent(new Event("popstate")); },
  };
  const window = {
    history, get location() { return new URL(entries[index].url); },
    dispatchEvent: events.dispatchEvent.bind(events),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  const source = readFileSync(new URL("../../src/lib/crm-navigation.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const navigation = {};
  let notifications = 0;
  const react = { useSyncExternalStore(subscribe, snapshot) {
    subscribe(() => notifications++);
    return snapshot();
  } };
  runInNewContext(compiled, { exports: navigation, require: () => react, window, URL, URLSearchParams, Event });
  navigation.useCrmUrl();
  navigation.navigateModule("Customers");
  navigation.openCrmRecord({ entity: "Customer", id: "customer" });
  navigation.navigateRecordTab("Sales & orders");
  navigation.openCrmRecord({ entity: "SalesOrder", id: "order" });
  assert.equal(window.location.pathname, "/staff");
  assert.equal(window.location.searchParams.get("module"), "Customers");
  assert.equal(window.location.searchParams.get("record"), "order");
  assert.equal(window.location.searchParams.get("tab"), null);
  history.back();
  assert.equal(window.location.searchParams.get("tab"), "Sales & orders");
  navigation.openCrmRecord({ entity: "SalesOrder", id: "order" });
  navigation.closeCrmRecord();
  assert.equal(window.location.searchParams.get("record"), "customer");
  assert.equal(window.location.searchParams.get("tab"), "Sales & orders");
  navigation.closeCrmRecord();
  assert.equal(window.location.search, "?module=Customers");
  navigation.navigateModule("CRM Setup");
  navigation.navigateSetup("Record Pages");
  assert.equal(window.location.searchParams.get("setup"), "Record Pages");
  navigation.openObjectRecords("standard:Branch");
  assert.equal(window.location.searchParams.get("setup"), "Object Manager");
  assert.equal(window.location.searchParams.get("customObject"), "standard:Branch");
  navigation.openObjectRecords("custom:qa__c");
  assert.equal(window.location.searchParams.get("customObject"), "custom:qa__c");
  navigation.navigateSetup("Workspace Navigation");
  assert.equal(window.location.searchParams.get("customObject"), null);
  assert.ok(notifications >= 9);
});


test("workspace navigation supports moving and hiding items without adding unauthorized modules", () => {
  const { arrangeNavigation, defaultNavigation, parseNavigation } = load("src/lib/workspace-navigation.ts");
  const catalog = [...defaultNavigation, { id: "custom:qa__c", label: "QA object", group: "My Work", visible: false }];
  const layout = parseNavigation([
    { id: "Sales Orders", group: "My Work", visible: true },
    { id: "Products", group: "My Work", visible: true },
    { id: "Customers", group: "Sales", visible: false },
    { id: "custom:qa__c", group: "Sales", visible: true },
  ], catalog);
  const permitted = [
    { id: "Customers", group: "Sales" },
    { id: "Products", group: "Inventory" },
    { id: "Sales Orders", group: "Sales" },
  ];
  assert.deepEqual(arrangeNavigation(permitted, layout), [{
    group: "My Work", entries: [{ id: "Sales Orders", group: "My Work" }, { id: "Products", group: "My Work" }],
  }]);
  assert.equal(layout.find(item => item.id === "custom:qa__c").label, "QA object");
  assert.equal(parseNavigation([{ id: "CRM Setup", group: "Overview", visible: false }]), null);
  assert.equal(parseNavigation([defaultNavigation[0], defaultNavigation[0]]), null);
});

test("consolidated navigation preserves payment records and the enquiry sales relationships", () => {
  const { defaultNavigation } = load("src/lib/workspace-navigation.ts");
  const shortcuts = defaultNavigation.map(item => item.id);
  assert.ok(shortcuts.includes("Invoices") && shortcuts.includes("Enquiries"));
  assert.ok(!shortcuts.includes("Payments") && !shortcuts.includes("Opportunities"));
  assert.ok(shortcuts.includes("Service Cases") && !shortcuts.includes("Job Cards"));
  assert.equal(catalog.recordRelationships("ServiceCase").find(item => item.key === "jobs")?.target, "JobCard");
  const invoice = catalog.recordRelationships("Invoice");
  assert.equal(invoice.find(item => item.key === "payments")?.target, "Payment");
  const enquiry = catalog.recordRelationships("Lead");
  assert.equal(enquiry.find(item => item.key === "quotes")?.target, "Quote");
  assert.equal(enquiry.find(item => item.key === "orders")?.convertedQuoteOrders, true);
});
