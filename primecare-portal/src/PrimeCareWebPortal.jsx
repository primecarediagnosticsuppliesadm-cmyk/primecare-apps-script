import React, { Suspense, useEffect, lazy } from "react";
import { ROLES, platformRoleLabel, NON_PILOT_RELEASE_MESSAGE, isPilotLaunchRole } from "./config/roles";
import { PERMISSIONS } from "./config/permissions";
import { isPageVisibleInCurrentEnvironment, MENU_ITEMS } from "./config/menuConfig";
import { normalizePageKey, resolvePageKeyForRole } from "./config/pageRouting.js";
import PortalAccessCard, {
  PageLoadingFallback,
  PortalAccessAction,
} from "@/components/ux/PortalAccessCard.jsx";

const AgentDashboard = lazy(() => import("./pages/AgentDashboard"));
const AgentPortalShell = lazy(() => import("./components/agent/AgentPortalShell.jsx"));
const AgentVisitPage = lazy(() => import("./pages/AgentVisitPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AIInsightsPage = lazy(() => import("./pages/AIInsightsPage"));
const CollectionsPage = lazy(() => import("./pages/CollectionsPage"));
const ExecutiveControlTower = lazy(() => import("./pages/ExecutiveControlTower"));
const FounderNavigationPage = lazy(() => import("./pages/FounderNavigationPage"));
const FounderStrategyPage = lazy(() => import("./pages/FounderStrategyPage"));
const FounderFinancialIntelligencePage = lazy(() => import("./pages/FounderFinancialIntelligencePage"));
const ExecutiveFinancialIntelligencePage = lazy(() => import("./pages/ExecutiveFinancialIntelligencePage"));
const TenantManagementPage = lazy(() => import("./pages/TenantManagementPage"));
const DistributorManagementPage = lazy(() => import("./pages/DistributorManagementPage"));
const DistributorOsPage = lazy(() => import("./pages/DistributorOsPage"));
const DistributorProvisioningPage = lazy(() => import("./pages/DistributorProvisioningPage"));
const CommissionEnginePage = lazy(() => import("./pages/CommissionEnginePage"));
const LabContractManagementPage = lazy(() => import("./pages/LabContractManagementPage"));
const LabOrderingPage = lazy(() => import("./pages/LabOrderingPage"));
const LabInvoiceCenterPage = lazy(() => import("./pages/LabInvoiceCenterPage.jsx"));
const LabsPage = lazy(() => import("./pages/LabsPage"));
const InventoryLedgerPage = lazy(() => import("./pages/InventoryLedgerPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const ReorderForecastPage = lazy(() => import("./pages/ReorderForecastPage"));
const StockPage = lazy(() => import("./pages/StockPage"));
const MasterCatalogPage = lazy(() => import("./pages/MasterCatalogPage"));
const PurchaseOrdersPage = lazy(() => import("./pages/PurchaseOrdersPage"));
const QualificationReviewPage = lazy(() => import("./pages/QualificationReviewPage"));
const PredatorDebugConsole = lazy(() => import("./pages/PredatorDebugConsole"));
const NotificationCenterPage = lazy(() => import("./pages/NotificationCenterPage"));
const OperationsCommandCenter = lazy(() => import("./pages/OperationsCommandCenter"));
const OperationsCenterAdminPage = lazy(() => import("./pages/OperationsCenterAdminPage"));
const LogisticsDeliveryPage = lazy(() => import("./pages/LogisticsDeliveryPage"));
const AccessAuditPage = lazy(() => import("./pages/AccessAuditPage"));
const QACommandCenterPage = lazy(() => import("./pages/QACommandCenterPage"));
const PilotReadinessPage = lazy(() => import("./pages/PilotReadinessPage"));
const RevenueFunnelPage = lazy(() => import("./pages/RevenueFunnelPage"));

function pageLabel(pageKey) {
  const key = normalizePageKey(pageKey);
  return MENU_ITEMS.find((item) => item.key === key)?.label || "this page";
}

function PageRedirect({ setActivePage, target = "dashboard" }) {
  useEffect(() => {
    setActivePage?.(target);
  }, [setActivePage, target]);
  return <PageLoadingFallback />;
}

function RoutedPage({ children }) {
  return <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>;
}

function UnauthorizedCard({ role, activePage, setActivePage }) {
  const roleLabel = platformRoleLabel(role) || role || "your";
  return (
    <PortalAccessCard
      variant="unauthorized"
      description={`${roleLabel} accounts cannot open ${pageLabel(activePage)}. Choose another item from the menu or contact your administrator.`}
      action={
        setActivePage ? (
          <PortalAccessAction label="Go to dashboard" onClick={() => setActivePage("dashboard")} />
        ) : null
      }
    />
  );
}

function UnmappedPageCard({ portalName, setActivePage }) {
  return (
    <PortalAccessCard
      variant="notFound"
      title={`${portalName} — section unavailable`}
      description="This link is not available in your workspace. Use the navigation menu to continue."
      action={
        setActivePage ? (
          <PortalAccessAction label="Go to dashboard" onClick={() => setActivePage("dashboard")} />
        ) : null
      }
    />
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

export default function PrimeCareWebPortal({
  role,
  activePage,
  currentUser,
  setActivePage,
  authToken,
}) {
  if (!canAccessPage(role, activePage)) {
    return (
      <RoutedPage>
        <UnauthorizedCard role={role} activePage={activePage} setActivePage={setActivePage} />
      </RoutedPage>
    );
  }

  if (role === ROLES.AGENT) {
    const agentPage = (() => {
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
            setActivePage={setActivePage}
          />
        );

      case "labs":
        return (
          <LabsPage
            currentUser={currentUser}
            authToken={authToken}
            setActivePage={setActivePage}
          />
        );

      case "notifications":
      case "notification-center":
        return <NotificationCenterPage currentUser={currentUser} setActivePage={setActivePage} />;

      default:
        return <UnmappedPageCard portalName="Agent Portal" setActivePage={setActivePage} />;
      }
    })();

    return (
      <RoutedPage>
        <AgentPortalShell
          currentUser={currentUser}
          activePage={activePage}
          setActivePage={setActivePage}
        >
          {agentPage}
        </AgentPortalShell>
      </RoutedPage>
    );
  }

  if (role === ROLES.ADMIN) {
    return (
      <RoutedPage>
        {(() => {
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
          <PageRedirect setActivePage={setActivePage} target="dashboard" />
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
            setActivePage={setActivePage}
          />
        );

      case "labs":
        return (
          <LabsPage
            currentUser={currentUser}
            authToken={authToken}
            setActivePage={setActivePage}
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
        return <OrdersPage currentUser={currentUser} setActivePage={setActivePage} />;
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
            setActivePage={setActivePage}
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
        return (
          <OperationsCenterAdminPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "logisticsDelivery":
      case "logistics-delivery":
        return (
          <LogisticsDeliveryPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "accessAudit":
      case "access-audit":
        return <AccessAuditPage currentUser={currentUser} />;

      case "performance":
        return <PageRedirect setActivePage={setActivePage} target="dashboard" />;

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
        return <UnmappedPageCard portalName="Admin Portal" setActivePage={setActivePage} />;
          }
        })()}
      </RoutedPage>
    );
  }

  if (role === ROLES.EXECUTIVE) {
    return (
      <RoutedPage>
        {(() => {
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

      case "executiveFinancialIntelligence":
        return (
          <ExecutiveFinancialIntelligencePage
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

      case "logisticsDelivery":
      case "logistics-delivery":
        return (
          <LogisticsDeliveryPage
            currentUser={currentUser}
            setActivePage={setActivePage}
          />
        );

      case "accessAudit":
      case "access-audit":
        return <AccessAuditPage currentUser={currentUser} />;

      case "labs":
        return (
          <LabsPage
            currentUser={currentUser}
            authToken={authToken}
            setActivePage={setActivePage}
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
        return <OrdersPage currentUser={currentUser} setActivePage={setActivePage} />;
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
            setActivePage={setActivePage}
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
        return <PageRedirect setActivePage={setActivePage} target="dashboard" />;

      case "insights":
      case "ai-insights":
        return <AIInsightsPage currentUser={currentUser} />;

      case "purchase":
      case "purchase-orders":
      case "procurement":
      case "suppliers":
        return <PurchaseOrdersPage currentUser={currentUser} />;

      default:
        return <UnmappedPageCard portalName="Executive Portal" setActivePage={setActivePage} />;
          }
        })()}
      </RoutedPage>
    );
  }

  if (role === ROLES.LAB) {
    const labPage = resolvePageKeyForRole(role, normalizePageKey(activePage));
    return (
      <RoutedPage>
        {(() => {
          switch (labPage) {
      case "labOrders":
      case "lab-orders":
      case "lab-ordering":
      case "ordering":
      case "orders":
        return <LabOrderingPage currentUser={currentUser} authToken={authToken} setActivePage={setActivePage} />;

      case "labInvoices":
      case "lab-invoices":
      case "invoices":
        return <LabInvoiceCenterPage currentUser={currentUser} />;

      case "labAccount":
        return (
          <CollectionsPage
            currentUser={currentUser}
            authToken={authToken}
            viewMode="labAccount"
            setActivePage={setActivePage}
          />
        );

      case "notifications":
      case "notification-center":
        return <NotificationCenterPage currentUser={currentUser} setActivePage={setActivePage} />;

      default:
        return <UnmappedPageCard portalName="Lab Portal" setActivePage={setActivePage} />;
          }
        })()}
      </RoutedPage>
    );
  }

  if (!isPilotLaunchRole(role)) {
    return (
      <RoutedPage>
        <PortalAccessCard
          variant="unauthorized"
          title="Workspace not available"
          description={NON_PILOT_RELEASE_MESSAGE}
        />
      </RoutedPage>
    );
  }

  return (
    <RoutedPage>
      <PortalAccessCard
        variant="error"
        title="Workspace unavailable"
        description="Your role is not recognized. Sign out and sign in again, or contact support."
      />
    </RoutedPage>
  );
}