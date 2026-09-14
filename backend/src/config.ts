// Reads backend configuration from the environment ONLY — see .env.example. This is the one
// place `OPENAI_API_KEY`/`OPENAI_MODEL`/`PORT` are read from; nothing else in the backend
// touches `process.env` directly, so there is exactly one place to audit for "does this ever
// leak the key anywhere" (see `redactedConfigSummary`, used only for startup logging).
import "dotenv/config";

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_PORT = 8787;

export interface BackendConfig {
  openAiApiKey: string | undefined;
  openAiModel: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const port = Number.parseInt(env.PORT ?? "", 10);
  return {
    openAiApiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
    openAiModel: env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
  };
}

export function isAiConfigured(config: BackendConfig): boolean {
  return config.openAiApiKey !== undefined;
}

/** Safe to log or return in any diagnostic response — never includes the key itself, only
 * whether one is present. */
export function redactedConfigSummary(config: BackendConfig): { aiConfigured: boolean; model: string; port: number } {
  return { aiConfigured: isAiConfigured(config), model: config.openAiModel, port: config.port };
}
