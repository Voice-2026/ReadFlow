import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { QuickTranslatorApp } from "./features/quick-translation/QuickTranslatorApp";
import { QuickExplainerApp } from "./features/quick-explanation/QuickExplainerApp";
import "./styles.css";

const windowMode = new URLSearchParams(window.location.search).get("window");
const isQuickTranslator = windowMode === "quick-translator";
const isQuickExplainer = windowMode === "quick-explainer";

if (isQuickTranslator || isQuickExplainer) {
  document.body.classList.add("quick-window-body");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isQuickTranslator ? <QuickTranslatorApp /> : isQuickExplainer ? <QuickExplainerApp /> : <App />}
  </StrictMode>,
);
