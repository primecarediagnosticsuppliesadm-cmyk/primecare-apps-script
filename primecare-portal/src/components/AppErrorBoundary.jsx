import React from "react";
import { logClientError } from "@/utils/debugLogger";

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
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm text-center">
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="mt-2 text-slate-500">The error was logged for review.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}