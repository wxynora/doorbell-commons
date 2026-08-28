import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WerewolfPage } from "./werewolf-page";

const root = document.querySelector<HTMLDivElement>("#werewolf-root");

if (!root) {
  throw new Error("Werewolf preview root is missing");
}

createRoot(root).render(
  <StrictMode>
    <WerewolfPage />
  </StrictMode>,
);
