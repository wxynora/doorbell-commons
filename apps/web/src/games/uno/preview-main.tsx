import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UnoPage } from "./uno-page";

const root = document.querySelector<HTMLDivElement>("#uno-root");

if (!root) {
  throw new Error("UNO preview root is missing");
}

createRoot(root).render(
  <StrictMode>
    <UnoPage />
  </StrictMode>,
);
