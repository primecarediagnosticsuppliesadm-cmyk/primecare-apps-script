import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ConnectPage from "./ConnectPage.jsx";
import "./styles.css";

function isConnectPath() {
  const path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
  return path === "/connect";
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isConnectPath() ? <ConnectPage /> : <App />}
  </StrictMode>
);
