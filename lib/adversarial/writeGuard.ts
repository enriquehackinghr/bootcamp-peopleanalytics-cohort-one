/**
 * Permission-layer write guard (PRD §4.2 / V8).
 * The improvement loop may never modify these paths.
 */

export const PERMISSION_LAYER_PATHS = [
  'lib/auth/permissions.ts',
  'lib/auth/guard.ts',
  'lib/auth/types.ts',
  'lib/auth/context.ts',
  'middleware.ts',
] as const

export const PERMISSION_LAYER_SYMBOLS = [
  'getVisibleEmployeeIds',
  'canAccessField',
  'applySuppression',
  'FIELD_MATRIX',
  'ROLE_DEFINITIONS',
  'canAccessRoute',
  'canAccessEmployee',
] as const

export const PERMITTED_TARGET_LAYERS = [
  'system_prompt',
  'tool_descriptions',
  'parameter_schemas',
  'refusal_rules',
  'clarification_rules',
  'citation_template',
  'tool_availability',
  'report_action_instructions',
] as const

export type PermittedTargetLayer = (typeof PERMITTED_TARGET_LAYERS)[number]

export function isPermittedTargetLayer(layer: string): layer is PermittedTargetLayer {
  return (PERMITTED_TARGET_LAYERS as readonly string[]).includes(layer)
}

export function isPermissionLayerPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  return PERMISSION_LAYER_PATHS.some((p) => normalized.endsWith(p.toLowerCase()))
}

export function isPermissionLayerSymbol(symbol: string): boolean {
  return (PERMISSION_LAYER_SYMBOLS as readonly string[]).includes(symbol)
}

export type WriteGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: 'permission_layer_blocked' }

/**
 * Automated write guard — blocks proposals that target the permission layer.
 */
export function assertWritableTarget(input: {
  targetLayer: string
  filePaths?: string[]
  symbols?: string[]
}): WriteGuardResult {
  if (!isPermittedTargetLayer(input.targetLayer)) {
    return {
      allowed: false,
      reason: `Target layer "${input.targetLayer}" is not in the permitted set. Permission-layer changes are blocked.`,
      code: 'permission_layer_blocked',
    }
  }
  for (const path of input.filePaths ?? []) {
    if (isPermissionLayerPath(path)) {
      return {
        allowed: false,
        reason: `Write to permission-layer path "${path}" is blocked.`,
        code: 'permission_layer_blocked',
      }
    }
  }
  for (const symbol of input.symbols ?? []) {
    if (isPermissionLayerSymbol(symbol)) {
      return {
        allowed: false,
        reason: `Write touching permission symbol "${symbol}" is blocked.`,
        code: 'permission_layer_blocked',
      }
    }
  }
  return { allowed: true }
}
