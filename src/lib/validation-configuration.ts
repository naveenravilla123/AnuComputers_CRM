import { validationEntities, type Rule } from "./metadata-runtime";
import { standardCatalog } from "./setup-metadata";

export function validationFieldKeys(entity: string, customKeys: string[]) {
  const standard = standardCatalog[entity]?.map(field => field.key) ?? [];
  return [...standard.filter(key => key !== "createdAt"), ...customKeys];
}

export function parseValidationRules(entity: string, input: unknown, customKeys: string[]): Rule[] {
  if (!validationEntities.some(object => object === entity) || !Array.isArray(input) || input.length > 30) {
    throw Error("Invalid rules");
  }

  const keys = validationFieldKeys(entity, customKeys);
  return input.map(rule => {
    if (!rule || !keys.includes(rule.field) ||
      !["required", "minLength", "equals"].includes(rule.operator) ||
      typeof rule.message !== "string" || !rule.message.trim() || rule.message.length > 200 ||
      typeof rule.operand !== "string" || rule.operand.length > 255 ||
      (rule.operator === "minLength" && (!/^\d+$/.test(rule.operand) || Number(rule.operand) > 5000))) {
      throw Error("Invalid rule");
    }

    return {
      field: rule.field,
      operator: rule.operator,
      operand: rule.operand,
      message: rule.message,
      enabled: rule.enabled === true,
    };
  });
}
