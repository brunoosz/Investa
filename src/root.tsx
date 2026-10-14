import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import "@fontsource-variable/inter";
import "./index.css";
import { initialTheme } from "@/store/ui";
import App from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { installAutoFit } from "@/lib/autofit";
import { loadIconVariant } from "@/lib/appIcon";

export function renderApp(): void {
  initialTheme();
  loadIconVariant();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <MotionConfig reducedMotion="user">
        <HashRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </HashRouter>
      </MotionConfig>
    </React.StrictMode>
  );
  installAutoFit();
}
