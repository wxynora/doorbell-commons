import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FlyingChessPage } from "./flying-chess-page";

const root = document.querySelector("#flying-chess-root");
if (!root) {
  throw new Error("Missing #flying-chess-root");
}

createRoot(root).render(
  <StrictMode>
    <FlyingChessPage />
  </StrictMode>,
);
