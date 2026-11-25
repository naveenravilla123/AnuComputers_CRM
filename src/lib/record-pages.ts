import { standardCatalog } from "./setup-metadata";

type Relation = { key: string; label: string; target: string; columns: string[]; path: string[]; source?: string };
const link = (key: string, label: string, target: string, columns: string[], ...path: string[]): Relation =>
  ({ key, label, target, columns, path });

const enquiries = link("leads", "Enquiries", "Lead", ["name", "stage", "source"], "customerId");
const orders = link("orders", "Sales Orders", "SalesOrder", ["number", "status", "total", "createdAt"], "customerId");
const cases = link("cases", "Service Cases", "ServiceCase", ["issue", "status", "priority"], "customerId");
const assets = link("assets", "Assets", "Asset", ["brand", "model", "serialNumber"], "customerId");
const invoices = link("invoices", "Invoices", "Invoice", ["number", "status", "total"], "customerId");
const quotes = link("quotes", "Quotations", "Quote", ["number", "status", "total", "expiresAt"], "lead", "customerId");
const payments = link("payments", "Payments", "Payment", ["amount", "method", "paidAt"], "invoice", "customerId");
const warranties = link("warranties", "Warranties", "Warranty", ["type", "startDate", "endDate"], "asset", "customerId");
const jobs = link("jobs", "Job Cards", "JobCard", ["status", "diagnosis", "deliveredAt"], "caseId");
function via(relation: Relation, ...path: string[]): Relation { return { ...relation, path }; }

function parent(key: string, label: string, target: string, source: string, ...columns: string[]): Relation {
  return { key, label, target, columns, path: ["id"], source };
}
const customer = parent("customer", "Customer", "Customer", "customerId", "name", "source");
const branch = parent("branch", "Branch", "Branch", "branchId", "name");
const product = parent("product", "Product", "Product", "productId", "name", "sku", "category");
const serviceCase = parent("case", "Service Case", "ServiceCase", "caseId", "issue", "status");
const asset = parent("asset", "Asset", "Asset", "assetId", "brand", "model");
const salesOrder = parent("order", "Sales Order", "SalesOrder", "orderId", "number", "status", "total");

const relationships: Record<string, Relation[]> = {
  Customer: [enquiries, quotes, orders, cases, assets, warranties, invoices, payments],
  Lead: [customer, via(quotes, "leadId")],
  Quote: [parent("lead", "Enquiry", "Lead", "leadId", "name", "stage")],
  Stock: [product, branch],
  Product: [via(assets, "productId"), link("stocks", "Stock", "Stock", ["qty", "reserved", "reorderPoint"], "productId")],
  SalesOrder: [customer, via(invoices, "orderId"), via(payments, "invoice", "orderId")],
  ServiceCase: [customer, asset, jobs, via(invoices, "caseId")],
  Asset: [customer, product, via(cases, "assetId"), via(warranties, "assetId")],
  Supplier: [link("purchases", "Purchase Orders", "PurchaseOrder", ["number", "status", "total"], "supplierId")],
  PurchaseOrder: [parent("supplier", "Supplier", "Supplier", "supplierId", "name")],
  JobCard: [serviceCase],
  Warranty: [asset],
  Invoice: [customer, salesOrder, serviceCase, via(payments, "invoiceId")],
  Payment: [parent("invoice", "Invoice", "Invoice", "invoiceId", "number", "status", "total")],
  Staff: [via(jobs, "technicianId")],
  Branch: [link("stocks", "Stock", "Stock", ["qty", "reserved", "reorderPoint"], "branchId")],
};

export function recordRelationships(entity: string) { return relationships[entity] ?? []; }

export type RecordTab = { label: string; lists: string[] };
export function defaultRecordTabs(entity: string): RecordTab[] {
  if (entity === "Customer") return [
    { label: "Sales", lists: ["leads", "quotes", "orders"] },
    { label: "Service", lists: ["cases", "assets", "warranties"] },
    { label: "Finance", lists: ["invoices", "payments"] },
  ];
  const lists = recordRelationships(entity).map(relation => relation.key);
  return lists.length ? [{ label: "Related", lists }] : [];
}

export const recordPageObjects = Object.keys(standardCatalog);
export type RecordPageData = {
  title: string;
  sections: { name: string; columns: number; fields: { label: string; value: unknown; lookup?: { entity: string; id: string } }[] }[];
  tabs: { label: string; lists: { key: string; label: string; target: string; columns: { key: string; label: string }[];
    rows: { id: string; [key: string]: unknown }[]; hasMore: boolean }[] }[];
};

export const recordFieldsObjects=["Customer","Lead","Product","SalesOrder","Quote","ServiceCase","JobCard","Asset","Invoice","Supplier","Stock","PurchaseOrder","Payment","Branch"];
