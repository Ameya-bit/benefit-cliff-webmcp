// Optional chaining keeps this importable outside Vite (node test scripts).
export const API_BASE: string =
  import.meta.env?.VITE_API_BASE ?? "http://localhost:8000";

// minimal_fix rebuilds a ~5s tax-benefit system per candidate value on a
// 1-vCPU instance — the slowest legitimate response is well over 30s.
export const API_TIMEOUT_MS = 120_000;
