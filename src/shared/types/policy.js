/**
 * Policy Module Type Definitions
 *
 * Canonical TypeScript types for architectural policy definitions.
 * The policy file declares architectural boundaries: which modules own which code,
 * which calls are allowed/forbidden, and which flags/permissions gate access.
 *
 * @see POLICY.md for complete schema documentation
 */
/**
 * Validates that an unknown value conforms to the PolicyModule interface.
 *
 * @param module - The value to validate
 * @returns True if the value is a valid PolicyModule, false otherwise
 *
 * @example
 * ```typescript
 * const data: unknown = JSON.parse(moduleJson);
 * if (validatePolicyModule(data)) {
 *   // data is now typed as PolicyModule
 *   console.log(data.owns_paths);
 * }
 * ```
 */
export function validatePolicyModule(module) {
  if (typeof module !== "object" || module === null) {
    return false;
  }
  const m = module;
  // Check optional array fields
  if (m.owns_paths !== undefined) {
    if (!Array.isArray(m.owns_paths)) return false;
    if (!m.owns_paths.every((p) => typeof p === "string")) return false;
  }
  if (m.owns_namespaces !== undefined) {
    if (!Array.isArray(m.owns_namespaces)) return false;
    if (!m.owns_namespaces.every((n) => typeof n === "string")) return false;
  }
  if (m.exposes !== undefined) {
    if (!Array.isArray(m.exposes)) return false;
    if (!m.exposes.every((e) => typeof e === "string")) return false;
  }
  if (m.coords !== undefined) {
    if (!Array.isArray(m.coords)) return false;
    if (m.coords.length !== 2) return false;
    if (typeof m.coords[0] !== "number" || typeof m.coords[1] !== "number") return false;
  }
  if (m.allowed_callers !== undefined) {
    if (!Array.isArray(m.allowed_callers)) return false;
    if (!m.allowed_callers.every((c) => typeof c === "string")) return false;
  }
  if (m.forbidden_callers !== undefined) {
    if (!Array.isArray(m.forbidden_callers)) return false;
    if (!m.forbidden_callers.every((c) => typeof c === "string")) return false;
  }
  if (m.feature_flags !== undefined) {
    if (!Array.isArray(m.feature_flags)) return false;
    if (!m.feature_flags.every((f) => typeof f === "string")) return false;
  }
  if (m.requires_permissions !== undefined) {
    if (!Array.isArray(m.requires_permissions)) return false;
    if (!m.requires_permissions.every((p) => typeof p === "string")) return false;
  }
  if (m.kill_patterns !== undefined) {
    if (!Array.isArray(m.kill_patterns)) return false;
    if (!m.kill_patterns.every((k) => typeof k === "string")) return false;
  }
  if (m.notes !== undefined && typeof m.notes !== "string") {
    return false;
  }
  return true;
}
//# sourceMappingURL=policy.js.map
