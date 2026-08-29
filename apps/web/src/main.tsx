import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { registerCommunityServiceWorker, shouldRegisterCommunityServiceWorker } from "./pwa";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Doorbell Commons root element is missing");
}

document.title = "Doorbell Commons";

if (shouldRegisterCommunityServiceWorker(import.meta.env.PROD, "serviceWorker" in navigator)) {
  void registerCommunityServiceWorker(navigator.serviceWorker);
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
