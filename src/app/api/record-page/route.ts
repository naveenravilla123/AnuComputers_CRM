import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/request-access";
import type { PermissionObject } from "@/lib/permissions";
import { canReadStaffField } from "@/lib/staff-field-access";
import { accessibleJobIds, canAccessServiceRecord } from "@/lib/record-sharing";
import { resolveRecordAudit } from "@/lib/record-audit-details";
import { auditPrefix, standardRecords } from "@/lib/standard-records";
import { effectiveLayout } from "@/lib/effective-layout";
import { recordPageObjects, recordRelationships, defaultRecordTabs, type RecordPageData, type RecordTab } from "@/lib/record-pages";
import { resolveLayout } from "@/lib/record-layout";
import { fieldLabel, recordSystemFields } from "@/lib/setup-metadata";
import { getStandardOverrides } from "@/lib/standard-field-overrides";

export const dynamic = "force-dynamic";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
type Row = { id: string; [key: string]: unknown };
type Delegate = { findMany(query: {
  where: Record<string, unknown>; select: Record<string, true>; orderBy: { id: "asc" }; skip: number; take: number;
}): Promise<Row[]> };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const entity = params.get("entity") ?? "";
  const id = params.get("id") ?? "";
  if (!recordPageObjects.includes(entity) || !id || id.length > 128) return fail("Invalid record", 400);
  const auth = await authorizeRequest(request, entity as PermissionObject, "READ");
  if (!auth.allowed) return fail(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  const staff = auth.access.kind === "staff" ? auth.access.user : null;
  const canRead = (object: string, field: string) => !staff || canReadStaffField(staff, object, field);

  try {
    if (staff && !await canAccessServiceRecord(prisma, staff, entity, id)) return fail("Record not found", 404);
    const [{ rows }, fields, values, overrides, audit] = await Promise.all([
      standardRecords(prisma, entity, id, "", 0),
      prisma.customField.findMany({ where: { entity }, select: { key: true, label: true, type: true, options: true } }),
      prisma.businessSetting.findUnique({ where: { key: "custom.values." + entity + "." + id } }),
      getStandardOverrides(prisma, entity),
      prisma.businessSetting.findUnique({ where: { key: auditPrefix + entity + "." + id } }),
    ]);
    const record = rows[0];
    if (!record) return fail("Record not found", 404);

    const labels = new Map(fields.map(field => [field.key, field.label]));
    const custom = values?.value;
    const systemFields = recordSystemFields.filter(field => field.key !== "id" && canRead(entity, field.key));
    const auditDetails = await resolveRecordAudit(prisma, audit?.value, field => canRead(entity, field));
    const available = {
      ...record,
      ...Object.fromEntries(fields.map(field => [
        field.key, custom && typeof custom === "object" && !Array.isArray(custom) ? custom[field.key] : null,
      ])),
      ...Object.fromEntries(systemFields.map(field => [
        field.key, auditDetails?.[field.key] ?? record[field.key] ?? null,
      ])),
    };
    const keys = Object.keys(available).filter(key => key !== "id" && canRead(entity, key));
    const customerKeys = new Set(["customerId", ...fields.filter(field => field.type === "LOOKUP" &&
      Array.isArray(field.options) && field.options[0] === "Customer").map(field => field.key)]);
    const customerIds = [...new Set(keys.flatMap(key => customerKeys.has(key) && typeof available[key] === "string" && available[key]
      ? [available[key] as string] : []))];
    const customerNames = new Map<string, string>();
    if (customerIds.length && canRead("Customer", "name")) {
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds } }, select: { id: true, name: true },
      });
      for (const customer of customers) customerNames.set(customer.id, customer.name);
    }
    const layout = await effectiveLayout(prisma, entity, [...labels.keys()], staff?.role, staff?.profileId);
    const sections = resolveLayout(layout, keys, "System Information", {
      hideUnplaced: true, required: systemFields.map(field => field.key),
    }).map(section => ({
      ...section, fields: section.fields.map(key => ({
        label: recordSystemFields.find(field => field.key === key)?.label ??
          (key === "customerId" ? overrides[key]?.label ?? "Customer" : labels.get(key) ?? overrides[key]?.label ?? fieldLabel(key)),
        value: !customerKeys.has(key) ? available[key] :
          typeof available[key] === "string" && available[key] ? customerNames.get(available[key] as string) ?? "Customer unavailable" : null,
        ...(customerKeys.has(key) && typeof available[key] === "string" && customerNames.has(available[key] as string)
          ? { lookup: { entity: "Customer", id: available[key] as string } } : {}),
      })),
    }));

    const prefix = "setup.recordPage.";
    const profiles = [staff?.profileId, staff?.role, "default"].filter((profile): profile is string => Boolean(profile));
    const configKeys = profiles.map(profile => prefix + profile + "." + entity);
    const configs = await prisma.businessSetting.findMany({ where: { key: { in: configKeys } } });
    const configured = configKeys.map(key => configs.find(row => row.key === key)?.value).find(Array.isArray);
    const tabs = (configured as RecordTab[] | undefined) ?? defaultRecordTabs(entity);
    const relations = recordRelationships(entity);
    const readableLists = await Promise.all(relations.filter(relation => tabs.some(tab => tab.lists.includes(relation.key)))
      .map(async relation => {
        const columns = relation.columns.filter(key => canRead(relation.target, key));
        if (!columns.length) return null;
        const targetId = relation.source ? record[relation.source] : id;
        if (relation.source && (!canRead(entity, relation.source) || typeof targetId !== "string")) return null;
        const intermediate = { lead: "Lead", asset: "Asset", invoice: "Invoice" } as Record<string, string>;
        if (staff && relation.path.slice(0, -1).some(key => !staff.permissions.includes(intermediate[key] + ":READ"))) return null;
        const where = relation.path.reduceRight<Record<string, unknown>>(
          (filter, key, index) => ({ [key]: index === relation.path.length - 1 ? targetId : filter }), {},
        );
        if (staff && (relation.target === "JobCard" || relation.target === "ServiceCase")) {
          const jobs = await accessibleJobIds(prisma, staff);
          if (jobs) {
            if (relation.target === "JobCard") where.id = { in: jobs };
            else where.jobs = { some: { id: { in: jobs } } };
          }
        }
        // Both the delegate and where keys come from the server's relationship catalog.
        const delegateName = relation.target[0].toLowerCase() + relation.target.slice(1);
        const delegate = (prisma as unknown as Record<string, Delegate>)[delegateName];
        const offset = params.get("list") === relation.key ? Math.min(5000, Math.max(0, Number.parseInt(params.get("offset") ?? "", 10) || 0)) : 0;
        const rows = await delegate.findMany({
          where, select: Object.fromEntries(["id", ...columns].map(key => [key, true])),
          orderBy: { id: "asc" }, skip: offset, take: 51,
        });
        return {
          key: relation.key, label: relation.label, target: relation.target,
          columns: columns.map(key => ({ key, label: fieldLabel(key) })), rows: rows.slice(0, 50), hasMore: rows.length > 50,
        };
      }));
    const title = ["name", "number", "issue", "sku"].find(key => canRead(entity, key) && record[key]);
    const result: RecordPageData = {
      title: title ? String(record[title]) : fieldLabel(entity),
      sections,
      tabs: tabs.flatMap(tab => {
        const lists = tab.lists.flatMap(key => readableLists.filter(list => list?.key === key && list !== null))
          .filter(list => list !== null);
        return lists.length ? [{ label: tab.label, lists }] : [];
      }),
    };
    return NextResponse.json(result);
  } catch {
    return fail("Unable to load the record page", 503);
  }
}
