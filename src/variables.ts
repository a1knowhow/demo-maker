/**
 * Variable resolution for demo scenario placeholders (e.g. {{ auth.email }}, {{ workspace_id }}).
 */

import type { RunContext } from "./types";

const PLACEHOLDER_REGEX = /\{\{\s*([^}]+)\s*\}\}/g;

/**
 * Resolves nested keys like "auth.email" or flat "workspace_id" from context.
 * context.auth.email, context.variables["workspace_id"], etc.
 */
function getNestedValue(
  context: RunContext,
  path: string
): string | undefined {
  const trimmed = path.trim();
  const parts = trimmed.split(".");

  // Single segment: check context.variables first (e.g. workspace_id, document_id)
  if (parts.length === 1 && context.variables?.[trimmed] !== undefined) {
    const v = context.variables[trimmed];
    return typeof v === "string" ? v : String(v);
  }

  let current: unknown = context;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (typeof current === "string") {
    return current;
  }
  if (typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return undefined;
}

/**
 * Replaces {{ path }} placeholders in template with values from context.
 * Supports auth.email, auth.password, workspace_id, document_id, mcp.tavily_url, etc.
 * Unresolved placeholders are left as-is.
 */
export function resolveVariables(template: string, context: RunContext): string {
  return template.replace(PLACEHOLDER_REGEX, (_, path: string) => {
    const value = getNestedValue(context, path.trim());
    return value !== undefined ? value : `{{ ${path.trim()} }}`;
  });
}

export interface IVariableResolver {
  resolve(template: string, context: RunContext): string;
}

export const defaultVariableResolver: IVariableResolver = {
  resolve: resolveVariables,
};
