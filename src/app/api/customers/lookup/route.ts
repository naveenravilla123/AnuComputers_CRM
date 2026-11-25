import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/request-access";
import { canReadStaffField } from "@/lib/staff-field-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request, "Customer", "READ");
  if (!auth.allowed) return NextResponse.json({ error: "Customer lookup unavailable" }, { status: auth.status });
  const staff = auth.access.kind === "staff" ? auth.access.user : null;
  if (staff && !canReadStaffField(staff, "Customer", "name")) {
    return NextResponse.json({ error: "Customer name access is required" }, { status: 403 });
  }
  const phone = !staff || canReadStaffField(staff, "Customer", "phone");
  const id = request.nextUrl.searchParams.get("id")?.trim();
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  if (id && id.length > 128) return NextResponse.json({ items: [] }, { status: 400 });
  const filters: Prisma.CustomerWhereInput[] = [{ name: { contains: query, mode: "insensitive" } }];
  if (phone) filters.push({ phone: { contains: query } });
  try {
    const customers = await prisma.customer.findMany({
      where: id ? { id } : query ? { OR: filters } : undefined,
      select: { id: true, name: true, phone },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: id ? 1 : 20,
    });
    return NextResponse.json({ items: customers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load customers" }, { status: 503 });
  }
}
