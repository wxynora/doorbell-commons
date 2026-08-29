import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { registerCommunityServiceWorker, shouldRegisterCommunityServiceWorker } from "./pwa";
import { createBrowserPwaInstallController } from "./pwa-install";
import { PwaInstallEntry } from "./pwa-install-entry";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Doorbell Commons root element is missing");
}

document.title = "Doorbell Commons";
const pwaInstallController = createBrowserPwaInstallController();

if (shouldRegisterCommunityServiceWorker(import.meta.env.PROD, "serviceWorker" in navigator)) {
  void registerCommunityServiceWorker(navigator.serviceWorker);
}

createRoot(root).render(
  <StrictMode>
    <App />
    <PwaInstallEntry controller={pwaInstallController} />
  </StrictMode>,
);
