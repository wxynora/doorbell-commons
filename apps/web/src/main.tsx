import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Doorbell Commons root element is missing");
}

document.title = "Doorbell Commons";

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
