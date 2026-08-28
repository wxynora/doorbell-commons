import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LeafGamePage } from "./leaf-game-page";

const root = document.querySelector<HTMLDivElement>("#leaf-game-root");

if (!root) {
  throw new Error("Leaf Game preview root is missing");
}

createRoot(root).render(
  <StrictMode>
    <LeafGamePage />
  </StrictMode>,
);
