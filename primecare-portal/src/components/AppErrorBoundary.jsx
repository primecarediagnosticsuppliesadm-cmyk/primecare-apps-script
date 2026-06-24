import React from "react";
import PortalAccessCard, { PortalAccessAction } from "@/components/ux/PortalAccessCard.jsx";
import { logClientError } from "@/utils/debugLogger.js";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  async componentDidCatch(error, errorInfo) {
    await logClientError({
      authToken: this.props.authToken || "",
      page: this.props.page || "App",
      component: "AppErrorBoundary",
      actionType: "REACT_RENDER_FAIL",
      errorCode: "REACT_BOUNDARY_ERROR",
      errorMessage: error?.message || "Unknown render error",
      stackTrace: `${error?.stack || ""}\n${errorInfo?.componentStack || ""}`,
      payload: {}
    });
  }

  render() {
    if (this.state.hasError) {
      const goHome = () => {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        if (base) window.location.assign(`${base}/`);
        else window.location.reload();
      };

      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <PortalAccessCard
            variant="error"
            title="Something went wrong"
            description="An unexpected error occurred in PrimeCare. Refresh the page or return to your dashboard. If the problem persists, contact your administrator."
            action={
              <div className="flex flex-wrap gap-2">
                <PortalAccessAction
                  label="Refresh page"
                  onClick={() => window.location.reload()}
                />
                <PortalAccessAction label="Back to dashboard" onClick={goHome} />
              </div>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}