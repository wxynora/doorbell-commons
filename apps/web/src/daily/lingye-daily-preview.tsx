import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./lingye-daily-page.css";
import { LingyeDailyPage } from "./lingye-daily-page";

const root = document.getElementById("lingye-daily-preview-root");

if (!root) {
  throw new Error("Missing Lingye Daily preview root");
}

createRoot(root).render(
  <StrictMode>
    <LingyeDailyPage issue={null} />
  </StrictMode>,
);
