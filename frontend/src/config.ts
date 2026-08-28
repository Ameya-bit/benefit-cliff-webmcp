// Optional chaining keeps this importable outside Vite (node test scripts).
export const API_BASE: string =
  import.meta.env?.VITE_API_BASE ?? "http://localhost:8000";

export const API_TIMEOUT_MS = 30_000;
