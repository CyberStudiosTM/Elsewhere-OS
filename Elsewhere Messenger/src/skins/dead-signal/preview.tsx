import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DeadSignal from "./DeadSignal";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Dead Signal preview root not found.");
}

createRoot(root).render(
  <StrictMode>
    <DeadSignal />
  </StrictMode>
);