import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { AuthProvider } from "./context/AuthContext";
import { exposePrimeCareBuildIdentity } from "./utils/buildStamp.js";
import "./index.css";

exposePrimeCareBuildIdentity();

ReactDOM.createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </AppErrorBoundary>
);