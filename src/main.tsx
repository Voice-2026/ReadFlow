import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { QuickTranslatorApp } from "./features/quick-translation/QuickTranslatorApp";
import "./styles.css";

const isQuickTranslator =
  new URLSearchParams(window.location.search).get("window") === "quick-translator";

if (isQuickTranslator) {
  document.body.classList.add("quick-window-body");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isQuickTranslator ? <QuickTranslatorApp /> : <App />}
  </StrictMode>,
);
