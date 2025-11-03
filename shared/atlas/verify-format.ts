/**
 * Verify output format matches the specification in README.md
 */

import { computeFoldRadius, Policy } from './index.js';

const samplePolicy: Policy = {
  modules: {
    "ui/user-admin-panel": {
      coords: [0, 2],
      allowed_callers: [],
      forbidden_callers: ["services/auth-core"],
      feature_flags: ["beta_user_admin"],
      requires_permissions: ["can_manage_users"],
      kill_patterns: ["duplicate_auth_logic"],
    },
    "services/user-access-api": {
      coords: [1, 2],
      allowed_callers: ["ui/user-admin-panel"],
      forbidden_callers: [],
    },
    "services/auth-core": {
      coords: [2, 1],
      allowed_callers: ["services/user-access-api"],
      forbidden_callers: ["ui/user-admin-panel"],
    },
  },
};

const atlasFrame = computeFoldRadius(["ui/user-admin-panel"], 1, samplePolicy);

console.log(JSON.stringify(atlasFrame, null, 2));
