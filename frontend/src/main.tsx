import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { usePeiraStore } from "./state/store";
import { registerPeiraTools } from "./webmcp/register";
import "./index.css";

// Register WebMCP tools before React mounts: StrictMode double-effects can
// never double-register, and agents see the tools as early as possible.
// The result drives the "no agent attached" hint for plain-browser visitors.
void registerPeiraTools().then((registered) =>
  usePeiraStore.getState().setWebmcpAvailable(registered),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
