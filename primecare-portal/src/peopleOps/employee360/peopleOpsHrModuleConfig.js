/**
 * HR module feature gate — Documents, Assets, Leave tabs hidden until enabled.
 */
export const PEOPLE_OPS_HR_MODULE_ENABLED = false;

export function isPeopleOpsHrModuleEnabled() {
  return PEOPLE_OPS_HR_MODULE_ENABLED === true;
}
