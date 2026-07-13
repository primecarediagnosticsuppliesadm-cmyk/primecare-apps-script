import { buildAgentCompensation360Model } from "@/compensation/agentCompensation360Model.js";
import { commissionEligibleRoleScope } from "./enterpriseCompensationRoles.js";
import { profileDisplayName } from "./employeeCompensationIdentity.js";
import { sectionsForEmployeeRole } from "./employeeCompensation360Workflow.js";

function str(value) {
  return String(value ?? "").trim();
}

export function buildEmployeeCompensation360Model(input = {}) {
  const profile = input.profile || {};
  const employeeRole = str(profile.role || input.employeeRole || "agent").toLowerCase();
  const agentModel = buildAgentCompensation360Model({
    ...input,
    agentId: input.agentId || profile.agent_id || "",
  });

  return {
    ...agentModel,
    profileUserId: str(input.profileUserId || profile.user_id),
    employeeRole,
    commissionEligible: commissionEligibleRoleScope(employeeRole),
    sections: sectionsForEmployeeRole(employeeRole),
    overview: {
      ...agentModel.overview,
      name: profileDisplayName(profile) || agentModel.overview.name,
      employeeId: str(input.profileUserId || profile.user_id) || agentModel.overview.employeeId,
      role: employeeRole,
    },
  };
}

/** @deprecated Use buildEmployeeCompensation360Model */
export const buildAgentCompensation360ModelAlias = buildEmployeeCompensation360Model;
