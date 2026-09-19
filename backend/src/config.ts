// Reads config from the environment. The only place in the backend that touches process.env.
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

/** Safe to log, never includes the actual key. */
export function redactedConfigSummary(config: BackendConfig): { aiConfigured: boolean; model: string; port: number } {
  return { aiConfigured: isAiConfigured(config), model: config.openAiModel, port: config.port };
}
