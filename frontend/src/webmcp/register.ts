/**
 * WebMCP registration lifecycle.
 *
 * - API surface: document.modelContext (current spec), falling back to the
 *   deprecated navigator.modelContext alias for pre-150 Chrome builds.
 * - One AbortController owns every registration; abort + re-register is the
 *   only way to change the tool set (duplicate names throw InvalidStateError).
 * - Called once from main.tsx before React mounts, so React StrictMode's
 *   double-effects can never double-register.
 */

import { TOOLS } from "./tools";

declare global {
  interface Navigator {
    readonly modelContext?: WebMCP.ModelContext;
  }
}

let controller: AbortController | null = null;

export function getModelContext(): WebMCP.ModelContext | undefined {
  return document.modelContext ?? navigator.modelContext;
}

export async function registerPeiraTools(): Promise<boolean> {
  const modelContext = getModelContext();
  if (!modelContext) {
    console.info(
      "[peira] WebMCP unavailable — open in ChatGPT's browser or Chrome with chrome://flags/#enable-webmcp-testing",
    );
    return false;
  }
  controller?.abort();
  controller = new AbortController();
  for (const tool of TOOLS) {
    await modelContext.registerTool(
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: tool.readOnly },
        async execute(input: Record<string, unknown>) {
          try {
            return await tool.execute(input);
          } catch (error) {
            // Surface a legible message to the agent instead of a stack trace.
            const message = error instanceof Error ? error.message : String(error);
            return { error: `${tool.name} failed: ${message}` };
          }
        },
      },
      { signal: controller.signal },
    );
  }
  console.info(`[peira] registered ${TOOLS.length} WebMCP tools`);
  return true;
}
