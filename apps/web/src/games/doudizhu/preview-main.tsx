import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DoudizhuPage } from "./doudizhu-page";

const root = document.querySelector<HTMLDivElement>("#doudizhu-root");

if (!root) {
  throw new Error("Dou Dizhu preview root is missing");
}

createRoot(root).render(
  <StrictMode>
    <DoudizhuPage />
  </StrictMode>,
);
