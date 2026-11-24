import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/staff-session";
import { effectiveLayout } from "@/lib/effective-layout";
import { resolveLayout } from "@/lib/record-layout";
import { fieldLabel } from "@/lib/setup-metadata";
import { canReadStaffField } from "@/lib/staff-field-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getStaffSession(request.cookies.get("anu_staff_session")?.value);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TECHNICIAN" || !user.permissions.includes("JobCard:READ")) {
      return NextResponse.json({ error: "Job card access denied" }, { status: 403 });
    }

    const canRead = (entity: string, field: string) => canReadStaffField(user, entity, field);
    const sharePrefix = "setup.jobShare.";
    const shared = await prisma.businessSetting.findMany({
      where: { key: { startsWith: sharePrefix }, value: { array_contains: [user.id] } },
      select: { key: true },
    });
    const [jobs, definitions] = await Promise.all([
      prisma.jobCard.findMany({
        where: { OR: [{ technicianId: user.id }, { id: { in: shared.map(row => row.key.slice(sharePrefix.length)) } }] },
        include: { case: { select: { issue: true, priority: true, asset: {
          select: { brand: true, model: true, serialNumber: true },
        } } } },
      }),
      prisma.customField.findMany({ where: { entity: "JobCard" }, orderBy: { label: "asc" } }),
    ]);
    const custom = definitions.filter(field => canRead("JobCard", field.key));
    const prefix = "custom.values.JobCard.";
    const [layout, stored] = await Promise.all([
      effectiveLayout(prisma, "JobCard", custom.map(field => field.key), user.role, user.profileId),
      custom.length && jobs.length
        ? prisma.businessSetting.findMany({ where: { key: { in: jobs.map(job => prefix + job.id) } } })
        : [],
    ]);
    const storedById = new Map(stored.map(row => [row.key.slice(prefix.length), row.value]));

    const filtered = jobs.map(job => {
      const standard = {
        caseId: job.caseId,
        technicianId: job.technicianId,
        diagnosis: job.diagnosis,
        status: job.status,
        laborCost: job.laborCost.toString(),
        notes: job.notes,
        deliveredAt: job.deliveredAt?.toISOString() ?? null,
      };
      const visibleKeys = Object.keys(standard).filter(key => canRead("JobCard", key));
      const values = storedById.get(job.id);
      const customValues = values && typeof values === "object" && !Array.isArray(values) ? values : {};
      const sections = resolveLayout(layout, [...visibleKeys, ...custom.map(field => field.key)], "Required fields", { hideUnplaced: true, required: custom.filter(field => field.required).map(field => field.key) }).map(section => ({
        name: section.name,
        columns: section.columns,
        fields: section.fields.map(key => ({
          key,
          label: custom.find(field => field.key === key)?.label ?? fieldLabel(key),
          value: visibleKeys.includes(key) ? standard[key as keyof typeof standard] : customValues[key] ?? null,
        })),
      }));

      return {
        id: job.id,
        status: canRead("JobCard", "status") ? job.status : null,
        diagnosis: canRead("JobCard", "diagnosis") ? job.diagnosis : null,
        notes: canRead("JobCard", "notes") ? job.notes : null,
        sections,
        case: {
          issue: canRead("ServiceCase", "issue") ? job.case.issue : null,
          priority: canRead("ServiceCase", "priority") ? job.case.priority : null,
          asset: job.case.asset && user.permissions.includes("ServiceCase:READ") ? {
            brand: canRead("Asset", "brand") ? job.case.asset.brand : null,
            model: canRead("Asset", "model") ? job.case.asset.model : null,
            serialNumber: canRead("Asset", "serialNumber") ? job.case.asset.serialNumber : null,
          } : null,
        },
      };
    });
    return NextResponse.json({ jobs: filtered }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
}
