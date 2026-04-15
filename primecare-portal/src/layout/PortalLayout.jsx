import { getMenuForRole } from "../config/menuConfig";
import { ROLES } from "../config/roles";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Building2,
  Boxes,
  ShoppingCart,
  AlertTriangle,
  BarChart3,
  Brain,
  Package,
} from "lucide-react";

const ICONS = {
  dashboard: LayoutDashboard,
  visits: ClipboardList,
  collections: Wallet,
  labs: Building2,
  inventory: Boxes,
  orders: ShoppingCart,
  risk: AlertTriangle,
  performance: BarChart3,
  insights: Brain,
  labOrders: Package,
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
}) {
  const menu = getMenuForRole(role);
  const activeMenuItem = menu.find((item) => item.key === activePage);

  const isFieldMobileRole =
    role === ROLES.AGENT || role === ROLES.LAB;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col bg-gray-900 text-white p-4">
          <div className="mb-6">
            <h1 className="text-lg font-bold">PrimeCare</h1>
            <p className="mt-1 text-xs text-gray-300">
              {titleCase(role)} Portal
            </p>
          </div>

          <nav className="space-y-2">
            {menu.map((item) => {
              const Icon = ICONS[item.key] || LayoutDashboard;
              const isActive = activePage === item.key;

              return (
                <button
                  key={item.key}
                  onClick={() => setActivePage(item.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    isActive
                      ? "bg-white text-black"
                      : "hover:bg-gray-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1">
          {/* Mobile top header */}
          <div className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-base font-semibold text-slate-900">
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
                    onClick={() => setActivePage(item.key)}
                    className={`whitespace-nowrap rounded-full px-3 py-2 text-sm transition ${
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
            className={`p-4 md:p-6 ${
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
                  onClick={() => setActivePage(item.key)}
                  className={`flex flex-col items-center justify-center gap-1 text-xs transition ${
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