import type { NextRequest } from "next/server";
import { authorized } from "./api-auth";
import { getStaffSession } from "./staff-session";
import { validSession } from "./session";
import type { permissionObjects, permissionActions } from "./permissions";
import {isStaffWorkspaceRequest} from "./staff-request-context";

export type StaffRequestUser = NonNullable<Awaited<ReturnType<typeof getStaffSession>>>;

export type RequestAccess =
  | { allowed: true; access: { kind: "admin"; user: null } | { kind: "staff"; user: StaffRequestUser } }
  | { allowed: false; status: 401 | 403 };

export async function authorizeAll(
  request: NextRequest,
  requirements: { object: typeof permissionObjects[number]; action: typeof permissionActions[number] }[],
) : Promise<RequestAccess> {
  if (isStaffWorkspaceRequest(request)) {
    const staff = await getStaffSession(request.cookies.get("anu_staff_session")?.value);
    if (!staff) return { allowed: false, status: 401 };
    if (requirements.some(({ object, action }) => !staff.permissions.includes(object + ":" + action))) {
      return { allowed: false, status: 403 };
    }
    return { allowed: true, access: { kind: "staff", user: staff } };
  }

  if (authorized(request) || await validSession(request.cookies.get("anu_session")?.value)) {
    return { allowed: true, access: { kind: "admin", user: null } };
  }
  const staff = await getStaffSession(request.cookies.get("anu_staff_session")?.value);
  if (!staff) return { allowed: false, status: 401 };
  if (requirements.some(({ object, action }) => !staff.permissions.includes(object + ":" + action))) {
    return { allowed: false, status: 403 };
  }
  return { allowed: true, access: { kind: "staff", user: staff } };
}

export async function authorizeRequest(
  request: NextRequest,
  object?: typeof permissionObjects[number],
  action?: typeof permissionActions[number],
) {
  return authorizeAll(request, object && action ? [{ object, action }] : []);
}

export async function adminOrStaff(
  request: NextRequest,
  object?: typeof permissionObjects[number],
  action?: typeof permissionActions[number],
) {
  const result = await authorizeRequest(request, object, action);
  return result.allowed ? result.access : null;
}
