import { ROLES } from "./config/roles";

import AgentPage from "./AgentPage";
import AgentDashboard from "./pages/AgentDashboard";
import AgentVisitPage from "./pages/AgentVisitPage";
import AdminDashboard from "./pages/AdminDashboard";
import AIInsightsPage from "./pages/AIInsightsPage";
import CollectionsPage from "./pages/CollectionsPage";
import ExecutiveControlTower from "./pages/ExecutiveControlTower";
import LabOrderingPage from "./pages/LabOrderingPage";
import LabsPage from "./pages/LabsPage";
import OrdersPage from "./pages/OrdersPage";
import ReorderForecastPage from "./pages/ReorderForecastPage";
import StockPage from "./pages/StockPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";

function PlaceholderCard({ title, subtitle }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-gray-500">{subtitle}</p>
    </div>
  );
}

export default function PrimeCareWebPortal({ role, activePage, currentUser, setActivePage }) {

  if (role === ROLES.AGENT) {
    switch (activePage) {
      case "dashboard":
  return (
    <AgentDashboard
      currentUser={currentUser}
      setActivePage={setActivePage}
    />
  );

       
       case "visits":
  return <AgentVisitPage currentUser={currentUser} authToken={authToken} />;

      case "collections":
        return <CollectionsPage currentUser={currentUser} />;

      case "labs":
        return <LabsPage currentUser={currentUser} />;

      case "orders":
        return (
          <PlaceholderCard
            title="Agent Orders"
            subtitle="Agent-specific order visibility will be mapped in Step 28.5."
          />
        );

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
        return <AdminDashboard currentUser={currentUser} />;

      case "visits":
        return <AgentPage currentUser={currentUser} />;

      case "purchase":
      case "purchase-orders":
      case "procurement":
        return <PurchaseOrdersPage currentUser={currentUser} />;

      case "collections":
        return <CollectionsPage currentUser={currentUser} />;

      case "labs":
        return <LabsPage currentUser={currentUser} />;

      case "inventory":
      case "stock":
        return <StockPage currentUser={currentUser} />;

      case "reorder":
      case "reorder-forecast":
        return <ReorderForecastPage currentUser={currentUser} />;

      case "orders":
        return <OrdersPage currentUser={currentUser} />;

      case "risk":
        return <CollectionsPage currentUser={currentUser} />;

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
        return <ExecutiveControlTower currentUser={currentUser} />;

      case "labs":
        return <LabsPage currentUser={currentUser} />;

      case "inventory":
      case "stock":
        return <StockPage currentUser={currentUser} />;

      case "reorder":
      case "reorder-forecast":
        return <ReorderForecastPage currentUser={currentUser} />;

      case "orders":
        return <OrdersPage currentUser={currentUser} />;

      case "risk":
        return <CollectionsPage currentUser={currentUser} />;

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
    switch (activePage) {
      case "labOrders":
      case "lab-orders":
      case "lab-ordering":
      case "ordering":
      case "orders":
        return <LabOrderingPage currentUser={currentUser} />;

      case "collections":
        return <CollectionsPage currentUser={currentUser} />;

      default:
        return (
          <PlaceholderCard
            title="Lab Portal"
            subtitle="Lab page is not mapped yet."
          />
        );
    }
  }

  return (
    <PlaceholderCard
      title="PrimeCare Portal"
      subtitle="No portal mapping found for this role."
    />
  );
}