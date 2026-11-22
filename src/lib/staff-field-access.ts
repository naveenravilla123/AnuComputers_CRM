type StaffAccess = {
  permissions: string[];
  fieldPermissions: string[];
};

export function canReadStaffField(user: StaffAccess, entity: string, field: string) {
  return user.permissions.includes(entity + ":READ") &&
    user.fieldPermissions.includes(entity + ":" + field + ":READ");
}
