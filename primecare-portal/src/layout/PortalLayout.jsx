import { getMenuForRole, getMenuSectionsForRole } from "../config/menuConfig";
import { ROLES } from "../config/roles";
import {
  LayoutDashboard,
  Compass,
  Target,
  Building,
  Briefcase,
  ClipboardList,
  ClipboardCheck,
  Coins,
  FileText,
  Wallet,
  Building2,
  Boxes,
  ShoppingCart,
  AlertTriangle,
  BarChart3,
  Brain,
  Package,
  Bug,
  Bell,
  Radio,
  Shield,
  TrendingUp,
} from "lucide-react";

const ICONS = {
  dashboard: LayoutDashboard,
  founderNavigation: Compass,
  founderStrategy: Target,
  founderFinancialIntelligence: BarChart3,
  revenueFunnel: TrendingUp,
  pilotReadiness: Target,
  tenantManagement: Building,
  distributorManagement: Briefcase,
  distributorOs: Building2,
  distributorProvisioning: ClipboardList,
  commissionEngine: Coins,
  labContractEngine: FileText,
  operationsCenter: Radio,
  accessAudit: Shield,
  visits: ClipboardList,
  collections: Wallet,
  labAccount: Wallet,
  labs: Building2,
  masterCatalog: Package,
  inventory: Boxes,
  orders: ShoppingCart,
  risk: AlertTriangle,
  qualificationReview: ClipboardCheck,
  performance: BarChart3,
  insights: Brain,
  labOrders: Package,
  predatorDebug: Bug,
  notifications: Bell,
};

function titleCase(value) {
  return String(value || "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export default function PortalLayout({
  role,
  activePage,
  setActivePage,
  children,
  navBadges = {},
}) {
  const menu = getMenuForRole(role);
  const menuSections = getMenuSectionsForRole(role);
  const activeMenuItem = menu.find((item) => item.key === activePage);

  function badgeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function renderNavButton(item) {
    const Icon = ICONS[item.key] || LayoutDashboard;
    const isActive = activePage === item.key;
    const badgeCount = badgeNum(navBadges[item.key]);
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => setActivePage(item.key)}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.label}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 ${
          isActive
            ? "bg-white/95 text-slate-900 shadow-sm"
            : "text-slate-200 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm font-medium">{item.label}</span>
        {badgeCount > 0 ? (
          <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        ) : null}
      </button>
    );
  }

  const isFieldMobileRole =
    role === ROLES.AGENT || role === ROLES.LAB;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-56 md:flex-col bg-slate-900/95 text-white px-3 py-4">
          <div className="mb-4 border-b border-white/10 pb-3">
            <h1 className="text-base font-semibold tracking-wide">PrimeCare</h1>
            <p className="mt-1 text-[11px] text-slate-300">
              {titleCase(role)} Portal
            </p>
          </div>

          <nav className="space-y-4 overflow-y-auto pb-2">
            {menuSections
              ? menuSections.map((section) => (
                  <div key={section.id}>
                    <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {section.label}
                    </p>
                    <div className="space-y-1">{section.items.map(renderNavButton)}</div>
                  </div>
                ))
              : menu.map(renderNavButton)}
          </nav>
        </aside>

        <main className="flex-1">
          {/* Mobile top header */}
          <div className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  PrimeCare
                </div>
                <div className="text-xs text-slate-500">
                  {activeMenuItem?.label || "Portal"}
                </div>
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {titleCase(role)}
              </div>
            </div>

            {/* Mobile quick navigation strip for all roles */}
            <div className="flex gap-2 overflow-x-auto px-3 pb-3">
              {menu.map((item) => {
                const isActive = activePage === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActivePage(item.key)}
                    aria-current={isActive ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main page content */}
          <div
            className={`p-3 md:p-5 ${
              isFieldMobileRole ? "pb-24 md:pb-6" : "pb-6"
            }`}
          >
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav for Agent + Lab only */}
      {isFieldMobileRole ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur md:hidden">
          <div
            className={`grid h-16 ${
              menu.length <= 4
                ? `grid-cols-${menu.length}`
                : "grid-cols-4"
            }`}
            style={{
              gridTemplateColumns:
                menu.length <= 4
                  ? `repeat(${menu.length}, minmax(0, 1fr))`
                  : "repeat(4, minmax(0, 1fr))",
            }}
          >
            {menu.slice(0, 4).map((item) => {
              const Icon = ICONS[item.key] || LayoutDashboard;
              const isActive = activePage === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActivePage(item.key)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.label}
                  className={`flex flex-col items-center justify-center gap-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                    isActive
                      ? "text-slate-900"
                      : "text-slate-500"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "stroke-[2.5]" : ""}`} />
                  <span className="truncate max-w-[70px]">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}