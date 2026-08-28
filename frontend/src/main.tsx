import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { registerPeiraTools } from "./webmcp/register";
import "./index.css";

// Register WebMCP tools before React mounts: StrictMode double-effects can
// never double-register, and agents see the tools as early as possible.
void registerPeiraTools();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
