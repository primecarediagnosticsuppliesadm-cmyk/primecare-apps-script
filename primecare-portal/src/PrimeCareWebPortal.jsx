import { ROLES } from "./config/roles";
import { PERMISSIONS } from "./config/permissions";
import { isPageVisibleInCurrentEnvironment } from "./config/menuConfig";
import { normalizePageKey, resolvePageKeyForRole } from "./config/pageRouting.js";

import AgentDashboard from "./pages/AgentDashboard";
import AgentVisitPage from "./pages/AgentVisitPage";
import AdminDashboard from "./pages/AdminDashboard";
import AIInsightsPage from "./pages/AIInsightsPage";
import CollectionsPage from "./pages/CollectionsPage";
import ExecutiveControlTower from "./pages/ExecutiveControlTower";
import FounderNavigationPage from "./pages/FounderNavigationPage";
import FounderStrategyPage from "./pages/FounderStrategyPage";
import FounderFinancialIntelligencePage from "./pages/FounderFinancialIntelligencePage";
import TenantManagementPage from "./pages/TenantManagementPage";
import DistributorManagementPage from "./pages/DistributorManagementPage";
import DistributorOsPage from "./pages/DistributorOsPage";
import DistributorProvisioningPage from "./pages/DistributorProvisioningPage";
import CommissionEnginePage from "./pages/CommissionEnginePage";
import LabContractManagementPage from "./pages/LabContractManagementPage";
import LabOrderingPage from "./pages/LabOrderingPage";
import LabsPage from "./pages/LabsPage";
import InventoryLedgerPage from "./pages/InventoryLedgerPage";
import OrdersPage from "./pages/OrdersPage";
import ReorderForecastPage from "./pages/ReorderForecastPage";
import StockPage from "./pages/StockPage";
import MasterCatalogPage from "./pages/MasterCatalogPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import QualificationReviewPage from "./pages/QualificationReviewPage";
import PredatorDebugConsole from "./pages/PredatorDebugConsole";
import NotificationCenterPage from "./pages/NotificationCenterPage";
import OperationsCommandCenter from "./pages/OperationsCommandCenter";
import OperationsCenterAdminPage from "./pages/OperationsCenterAdminPage";
import QACommandCenterPage from "./pages/QACommandCenterPage";
import PilotReadinessPage from "./pages/PilotReadinessPage";
import RevenueFunnelPage from "./pages/RevenueFunnelPage";

function PlaceholderCard({ title, subtitle }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-gray-500">{subtitle}</p>
    </div>
  );
}

function canAccessPage(role, activePage) {
  const key = resolvePageKeyForRole(role, normalizePageKey(activePage));
  return Boolean(
    role &&
      key &&
      PERMISSIONS[key]?.includes(role) &&
      isPageVisibleInCurrentEnvironment(key)
  );
}

function UnauthorizedCard({ role, activePage }) {
  return (
    <PlaceholderCard
      title="Unauthorized"
      subtitle={`Your ${role || "current"} role cannot access ${activePage || "this page"}.`}
    />
  );
}

export default function PrimeCareWebPortal({
  role,
  activePage,
  currentUser,
  setActivePage,
  authToken,
}) {
  if (!canAccessPage(role, activePage)) {
    return <UnauthorizedCard role={role} activePage={activePage} />;
  }

  if (role === ROLES.AGENT) {
    switch (activePage) {
      case "dashboard":
        return (
          <AgentDashboard
            currentUser={currentUser}
            setActivePage={setActivePage}
            authToken={authToken}
          />
        );

      case "visits":
        return (
          <AgentVisitPage
            currentUser={currentUser}
            authToken={authToken}
            setActivePage={setActivePage}
          />
        );

      case "collections":
        return (
          <CollectionsPage
            currentUser={currentUser}
            authToken={authToken}
          />
        );

      case "labs":
        return (
          <LabsPage
            currentUser={currentUser}
            authToken={authToken}
          />
        );

      case "orders":
        return (
          <PlaceholderCard
            title="Agent Orders"
            subtitle="Agent-specific order visibility will be mapped in a later step."
          />
        );

      case "notifications":
      case "notification-center":
        return <NotificationCenterPage currentUser={currentUser} setActivePage={setActivePage} />;

      default:
        return (
          <PlaceholderCard
            title="Agent Portal"
            subtitle="Agent-specific page is not mapped yet."
          />
        );
    }
  }

  if (role === ROLES.ADMIN) {
    switch (activePage) {
      case "dashboard":
  return (
    <AdminDashboard
      currentUser={currentUser}
      setActivePage={setActivePage}
    />
  );

      case "visits":
        return (
          <AgentVisitPage
            currentUser={currentUser}
            authToken={authToken}
            setActivePage={setActivePage}
          />
        );

      case "purchase":
      case "purchase-orders":
      case "procurement":
        return <PurchaseOrdersPage currentUser={currentUser} />;

      case "collections":
        return (
          <CollectionsPage
            currentUser={currentUser}
            authToken={authToken}
          />
        );

      case "labs":
        return (
          <LabsPage
            currentUser={currentUser}
            authToken={authToken}
          />
        );

      case "masterCatalog":
        return <MasterCatalogPage currentUser={currentUser} />;

      case "inventory":
      case "stock":
        return <StockPage currentUser={currentUser} />;

      case "inventory-ledger":
      case "inventory-movements":
        return <InventoryLedgerPage currentUser={currentUser} />;

      case "reorder":
      case "reorder-forecast":
        return <ReorderForecastPage currentUser={currentUser} />;

      case "orders":
        return <OrdersPage currentUser={currentUser} />;
      case "distributorOs":
        return (
          <DistributorOsPage
            currentUser={currentUser}
            setActivePage={setActivePage}
            authToken={authToken}
          />
        );

      case "risk":
        return (
          <CollectionsPage
            currentUser={currentUser}
            authToken={authToken}
          />
        );

      case "qualificationReview":
      case "qualification-review":
        return (
          <QualificationReviewPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "notifications":
      case "notification-center":
        return <NotificationCenterPage currentUser={currentUser} setActivePage={setActivePage} />;

      case "predatorDebug":
      case "predator-debug":
        return <PredatorDebugConsole currentUser={currentUser} />;

      case "operationsCenter":
      case "operations-center":
        return <OperationsCenterAdminPage currentUser={currentUser} />;

      case "performance":
        return (
          <PlaceholderCard
            title="Agent Performance"
            subtitle="Productivity, visits, collections, and field execution quality."
          />
        );

      case "insights":
      case "ai-insights":
        return <AIInsightsPage currentUser={currentUser} />;

      case "suppliers":
        return <PurchaseOrdersPage currentUser={currentUser} />;

      case "labContractEngine":
        return (
          <LabContractManagementPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      default:
        return (
          <PlaceholderCard
            title="Admin Portal"
            subtitle="Admin page is not mapped yet."
          />
        );
    }
  }

  if (role === ROLES.EXECUTIVE) {
    switch (activePage) {
      case "dashboard":
        return (
          <ExecutiveControlTower
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "founderNavigation":
        return (
          <FounderNavigationPage
            setActivePage={setActivePage}
            currentUser={currentUser}
          />
        );

      case "founderStrategy":
        return (
          <FounderStrategyPage
            setActivePage={setActivePage}
            currentUser={currentUser}
          />
        );

      case "founderFinancialIntelligence":
        return (
          <FounderFinancialIntelligencePage
            setActivePage={setActivePage}
            currentUser={currentUser}
          />
        );

      case "revenueFunnel":
      case "revenue-funnel":
        return (
          <RevenueFunnelPage currentUser={currentUser} setActivePage={setActivePage} />
        );

      case "pilotReadiness":
      case "pilot-readiness":
        return <PilotReadinessPage currentUser={currentUser} />;

      case "qaCommandCenter":
      case "qa-command-center":
        return <QACommandCenterPage currentUser={currentUser} />;

      case "tenantManagement":
        return <TenantManagementPage currentUser={currentUser} />;

      case "distributorManagement":
        return (
          <DistributorManagementPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "distributorProvisioning":
        return (
          <DistributorProvisioningPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "commissionEngine":
        return <CommissionEnginePage currentUser={currentUser} />;

      case "labContractEngine":
        return (
          <LabContractManagementPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "operationsCenter":
      case "operations-center":
        return (
          <OperationsCommandCenter
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "labs":
        return (
          <LabsPage
            currentUser={currentUser}
            authToken={authToken}
          />
        );

      case "masterCatalog":
        return <MasterCatalogPage currentUser={currentUser} />;

      case "inventory":
      case "stock":
        return <StockPage currentUser={currentUser} />;

      case "inventory-ledger":
      case "inventory-movements":
        return <InventoryLedgerPage currentUser={currentUser} />;

      case "reorder":
      case "reorder-forecast":
        return <ReorderForecastPage currentUser={currentUser} />;

      case "orders":
        return <OrdersPage currentUser={currentUser} />;
      case "distributorOs":
        return (
          <DistributorOsPage
            currentUser={currentUser}
            setActivePage={setActivePage}
            authToken={authToken}
          />
        );

      case "risk":
        return (
          <CollectionsPage
            currentUser={currentUser}
            authToken={authToken}
          />
        );

      case "qualificationReview":
      case "qualification-review":
        return (
          <QualificationReviewPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "notifications":
      case "notification-center":
        return <NotificationCenterPage currentUser={currentUser} setActivePage={setActivePage} />;

      case "predatorDebug":
      case "predator-debug":
        return <PredatorDebugConsole currentUser={currentUser} />;

      case "performance":
        return (
          <PlaceholderCard
            title="Business Performance"
            subtitle="Business-wide performance across operations and field execution."
          />
        );

      case "insights":
      case "ai-insights":
        return <AIInsightsPage currentUser={currentUser} />;

      case "purchase":
      case "purchase-orders":
      case "procurement":
      case "suppliers":
        return <PurchaseOrdersPage currentUser={currentUser} />;

      default:
        return (
          <PlaceholderCard
            title="Executive Portal"
            subtitle="Executive page is not mapped yet."
          />
        );
    }
  }

  if (role === ROLES.LAB) {
    const labPage = resolvePageKeyForRole(role, normalizePageKey(activePage));
    switch (labPage) {
      case "labOrders":
      case "lab-orders":
      case "lab-ordering":
      case "ordering":
      case "orders":
        return <LabOrderingPage currentUser={currentUser} authToken={authToken} />;

      case "labAccount":
        return (
          <CollectionsPage
            currentUser={currentUser}
            authToken={authToken}
            viewMode="labAccount"
          />
        );

      case "notifications":
      case "notification-center":
        return <NotificationCenterPage currentUser={currentUser} setActivePage={setActivePage} />;

      default:
        return (
          <PlaceholderCard
            title="Lab Portal"
            subtitle="Lab-specific page is not mapped yet."
          />
        );
    }
  }

  return (
    <PlaceholderCard
      title="PrimeCare Portal"
      subtitle="Role is not recognized yet."
    />
  );
}