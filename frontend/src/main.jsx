import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./components/AuthGate.jsx";
import DashboardErrorBoundary from "./components/DashboardErrorBoundary.jsx";
import "./index.css";
import "./dashboard.css";
import "./auth.css";
import "./tables.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DashboardErrorBoundary><AuthGate><App /></AuthGate></DashboardErrorBoundary>
  </React.StrictMode>
);
