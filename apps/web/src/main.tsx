import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerApplicationServiceWorker } from "./service-worker/client";
import "./styles.css";
import { applyTheme, readStoredTheme } from "./theme";

void registerApplicationServiceWorker();
applyTheme(readStoredTheme() ?? "light");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
