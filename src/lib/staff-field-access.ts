export type StaffAccess = {
  permissions: string[];
  fieldPermissions: string[];
};

const relations: Record<string, Record<string, string>> = {
  Customer: { leads: "Lead", assets: "Asset", cases: "ServiceCase", orders: "SalesOrder", invoices: "Invoice" },
  Lead: { customer: "Customer", quotes: "Quote" },
  Product: { stocks: "Stock", purchaseItems: "PurchaseOrder", orderItems: "SalesOrder", quoteItems: "Quote", assets: "Asset" },
  Stock: { product: "Product", branch: "Branch" },
  Branch: { stocks: "Stock" },
  PurchaseOrder: { supplier: "Supplier", product: "Product", items: "PurchaseOrder" },
  Quote: { lead: "Lead", product: "Product", items: "Quote" },
  SalesOrder: { customer: "Customer", product: "Product", items: "SalesOrder", invoices: "Invoice" },
  Asset: { customer: "Customer", product: "Product", cases: "ServiceCase", warranties: "Warranty" },
  ServiceCase: { customer: "Customer", asset: "Asset", jobs: "JobCard", invoices: "Invoice" },
  JobCard: { case: "ServiceCase", technician: "Staff", parts: "Product" },
  Warranty: { asset: "Asset" },
  Staff: { assignments: "JobCard" },
  Invoice: { customer: "Customer", order: "SalesOrder", case: "ServiceCase", payments: "Payment" },
  Payment: { invoice: "Invoice" },
};

export function canReadStaffField(user: StaffAccess, entity: string, field: string) {
  return user.permissions.includes(entity + ":READ") &&
    user.fieldPermissions.includes(entity + ":" + field + ":READ");
}

export function canEditStaffField(user: StaffAccess, entity: string, field: string) {
  return (user.permissions.includes(entity + ":EDIT") || user.permissions.includes(entity + ":CREATE")) &&
    user.fieldPermissions.includes(entity + ":" + field + ":READ") &&
    user.fieldPermissions.includes(entity + ":" + field + ":EDIT");
}

export function canReadStaffFields(user: StaffAccess, requirements: [string, string][]) {
  return requirements.every(([entity, field]) => canReadStaffField(user, entity, field));
}

export function staffReadableFields<T extends { key: string }>(
  user: StaffAccess,
  entity: string,
  fields: T[],
) {
  return fields.filter(field => canReadStaffField(user, entity, field.key));
}

export function assertStaffFieldEdits(
  user: StaffAccess,
  entity: string,
  fields: string[],
) {
  if (fields.some(field => !canEditStaffField(user, entity, field))) {
    throw new Error("Field edit permission required");
  }
}

export function filterStaffRecord<T>(user: StaffAccess, entity: string, value: T): T | null {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item => filterStaffRecord(user, entity, item)).filter(item => item !== null) as T;
  }
  if (typeof value !== "object") return value;
  if (!user.permissions.includes(entity + ":READ")) return null;

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const related = relations[entity] ?? {};
  for (const [key, fieldValue] of Object.entries(record)) {
    const childEntity = related[key];
    if (childEntity) {
      if (fieldValue === null) result[key] = null;
      else if (Array.isArray(fieldValue)) {
        result[key] = user.permissions.includes(childEntity + ":READ")
          ? filterStaffRecord(user, childEntity, fieldValue)
          : [];
      }
      else if (user.permissions.includes(childEntity + ":READ")) {
        result[key] = filterStaffRecord(user, childEntity, fieldValue);
      }
    } else if (Array.isArray(fieldValue)) {
      result[key] = canReadStaffField(user, entity, key) ? fieldValue : [];
    } else if (key === "id" || canReadStaffField(user, entity, key)) {
      result[key] = fieldValue;
    }
  }
  return result as T;
}

export function filterStaffResponse<T>(
  user: StaffAccess,
  value: T,
  collections: Record<string, string>,
): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = { ...(value as Record<string, unknown>) };
  for (const [key, entity] of Object.entries(collections)) {
    const records = result[key];
    if (Array.isArray(records)) {
      result[key] = records.map(record => filterStaffRecord(user, entity, record)).filter(Boolean);
    }
  }
  return result as T;
}
