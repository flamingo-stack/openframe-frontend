import type { PermissionCategory } from '@flamingo-stack/openframe-frontend-core';
import { normalizeToolTypeWithFallback } from '@flamingo-stack/openframe-frontend-core/utils';
import type { PolicyRule } from './guardrails.types';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Groups flat policy rules into policy-group → categories → policies for the
 * core-lib PolicyConfigurationPanel. Pure data transform — presentation state
 * (expansion, bulk selections) is owned by the panel.
 */
export function buildPolicyGroups(rules: PolicyRule[]): Map<string, PermissionCategory[]> {
  const groupedByPolicyGroup = new Map<string, Map<string, PermissionCategory>>();

  for (const rule of rules) {
    const policyGroupName = rule.policyGroup || 'General';
    const categoryName = rule.category || 'Other';
    const categoryId = slugify(`${policyGroupName}:${categoryName}`) || 'other';

    let categoriesMap = groupedByPolicyGroup.get(policyGroupName);
    if (!categoriesMap) {
      categoriesMap = new Map();
      groupedByPolicyGroup.set(policyGroupName, categoriesMap);
    }

    let category = categoriesMap.get(categoryId);
    if (!category) {
      category = { id: categoryId, name: categoryName, policies: [] };
      categoriesMap.set(categoryId, category);
    }

    category.policies.push({
      id: rule.naturalKey,
      naturalKey: rule.naturalKey,
      name: rule.operation || rule.naturalKey,
      commandPattern: rule.commandPattern,
      toolName: normalizeToolTypeWithFallback(rule.tool),
      approvalLevel: rule.approvalLevel,
    });
  }

  const finalGroups = new Map<string, PermissionCategory[]>();
  for (const [policyGroupName, categoriesMap] of groupedByPolicyGroup) {
    finalGroups.set(
      policyGroupName,
      Array.from(categoriesMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  return finalGroups;
}
