import { validateCustom } from "./custom-validation";

export const customFieldTypes = ["TEXT", "TEXTAREA", "NUMBER", "CHECKBOX", "DATE", "EMAIL", "PHONE", "PICKLIST"] as const;
export const customObjectStandardFields = [
  { key: "Id", label: "Record ID", storage: "id", type: "ID" },
  { key: "Name", label: "Record Name", storage: "name", type: "TEXT" },
  { key: "CreatedDate", label: "Created Date", storage: "createdAt", type: "Date/Time" },
  { key: "CreatedById", label: "Created By", storage: "createdBy", type: "User" },
  { key: "LastModifiedDate", label: "Last Modified Date", storage: "updatedAt", type: "Date/Time" },
  { key: "LastModifiedById", label: "Last Modified By", storage: "lastModifiedBy", type: "User" },
  { key: "OwnerId", label: "Owner", storage: "owner", type: "User" },
] as const;

export type ObjectField = { key: string; label: string; type: string; required?: boolean; options?: string[] };
export type FieldValue = string | number | boolean;

export const validObjectKey = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(value);

export function normalizeFieldType(type: string) {
  return type.toUpperCase();
}

export function parseObjectFields(input: unknown, legacyCount = 0): ObjectField[] {
  if (!Array.isArray(input) || input.length > 30) throw Error("An object can have up to 30 custom fields");
  const keys = new Set<string>();
  const reserved = new Set([...customObjectStandardFields.flatMap(field => [field.key, field.storage]),
    "lookupId", "constructor", "prototype"].map(key => key.toLowerCase().replace(/_/g, "")));
  return input.map((field, index) => {
    if (!field || !validObjectKey(field.key) || keys.has(field.key) ||
        typeof field.label !== "string" || !field.label.trim() || field.label.length > 100 ||
        typeof field.type !== "string") throw Error("Invalid field definition");
    if (index >= legacyCount && reserved.has(field.key.replace(/_/g, ""))) throw Error("Field API name is reserved");
    const type = normalizeFieldType(field.type);
    if (!customFieldTypes.some(option => option === type)) throw Error("Unsupported field type");
    const options: string[] = type === "PICKLIST" && Array.isArray(field.options)
      ? [...new Set<string>(field.options.filter((item: unknown): item is string => typeof item === "string")
        .map((option: string) => option.trim()).filter(Boolean))] : [];
    if (type === "PICKLIST" && (!options.length || options.length > 100 || options.some(option => option.length > 255))) {
      throw Error("Picklist requires 1–100 options of up to 255 characters");
    }
    keys.add(field.key);
    return { key: field.key, label: field.label.trim(), type, required: field.required === true, options };
  });
}

export function validateObjectValues(fields: ObjectField[], input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Invalid field values");
  const values = { ...Object.fromEntries(fields.filter(field => normalizeFieldType(field.type) === "CHECKBOX")
    .map(field => [field.key, false])), ...input };
  return validateCustom(fields.map(field => ({
    ...field, type: normalizeFieldType(field.type), required: field.required ?? false,
  })), values);
}

export function customRecordAudit(actorId: string | null, timestamp: string, prior?: {
  createdBy?: string | null; createdAt?: string | null; owner?: string | null;
}) {
  return {
    createdBy: prior ? prior.createdBy ?? null : actorId,
    createdAt: prior ? prior.createdAt ?? null : timestamp,
    owner: prior ? prior.owner ?? null : actorId,
    lastModifiedBy: actorId,
    updatedAt: timestamp,
  };
}
