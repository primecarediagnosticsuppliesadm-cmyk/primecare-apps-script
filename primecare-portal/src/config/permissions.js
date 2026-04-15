import { ROLES } from "./roles";

export const PERMISSIONS = {
  dashboard: [ROLES.AGENT, ROLES.ADMIN, ROLES.EXECUTIVE],
  visits: [ROLES.AGENT, ROLES.ADMIN],
  collections: [ROLES.AGENT, ROLES.ADMIN],
  labs: [ROLES.AGENT, ROLES.ADMIN, ROLES.EXECUTIVE],
  inventory: [ROLES.ADMIN, ROLES.EXECUTIVE],
  orders: [ROLES.ADMIN, ROLES.EXECUTIVE],
  risk: [ROLES.ADMIN, ROLES.EXECUTIVE],
  performance: [ROLES.ADMIN, ROLES.EXECUTIVE],
  insights: [ROLES.EXECUTIVE],
  labOrders: [ROLES.LAB],
  purchase: [ROLES.ADMIN],
  
};