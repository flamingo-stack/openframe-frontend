import type { ApprovalLevel, PermissionCategory } from '@flamingo-stack/openframe-frontend-core';
import type { PolicyRule } from './guardrails.types';

/**
 * Pending-edit bookkeeping shared by the tenant guardrails editor
 * (`use-guardrails-editor.ts`) and the per-customer settings block
 * (`customer-guardrails-settings.tsx`). The invariant both rely on: an edit
 * that returns a rule to its base level is DROPPED from the map, so the edits
 * map always equals exactly the overrides worth persisting.
 */

/** Approval levels as the server knows them, keyed by naturalKey. */
export function buildBaseLevels(rules: PolicyRule[]): Map<string, ApprovalLevel> {
  const levels = new Map<string, ApprovalLevel>();
  for (const rule of rules) {
    levels.set(rule.naturalKey, rule.approvalLevel);
  }
  return levels;
}

/** The rules with pending edits overlaid (no-op when there are none). */
export function applyEditsToRules(
  rules: PolicyRule[],
  edits: ReadonlyMap<string, ApprovalLevel> | null | undefined,
): PolicyRule[] {
  if (!edits?.size) return rules;
  return rules.map(rule => {
    const level = edits.get(rule.naturalKey);
    return level ? { ...rule, approvalLevel: level } : rule;
  });
}

/** New edits map with one policy's level changed (dropped when it equals base). */
export function withPolicyEdit(
  edits: ReadonlyMap<string, ApprovalLevel>,
  baseLevels: ReadonlyMap<string, ApprovalLevel>,
  naturalKey: string,
  level: ApprovalLevel,
): Map<string, ApprovalLevel> {
  const next = new Map(edits);
  if (baseLevels.get(naturalKey) === level) next.delete(naturalKey);
  else next.set(naturalKey, level);
  return next;
}

/** New edits map with a level bulk-applied to every policy in a category. */
export function withCategoryEdits(
  edits: ReadonlyMap<string, ApprovalLevel>,
  baseLevels: ReadonlyMap<string, ApprovalLevel>,
  category: PermissionCategory,
  level: ApprovalLevel,
): Map<string, ApprovalLevel> {
  const next = new Map(edits);
  for (const policy of category.policies) {
    if (baseLevels.get(policy.naturalKey) === level) next.delete(policy.naturalKey);
    else next.set(policy.naturalKey, level);
  }
  return next;
}
