export function hasStaffPermission(
  user: { permissions?: unknown } | null | undefined,
  object: string,
  action: "READ" | "CREATE" | "EDIT" | "DELETE",
) {
  return Array.isArray(user?.permissions)
    && user.permissions.includes(object + ":" + action);
}
