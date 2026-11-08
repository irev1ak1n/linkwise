// Bootstraps the backend. Separate from app.ts so tests never bind a real port.
import { createApp } from "./app";
import { loadConfig, redactedConfigSummary } from "./config";

const config = loadConfig();
const app = createApp({ config });

// 0.0.0.0, not localhost: a cloud host (Railway) reaches the server from outside the container.
app.listen(config.port, config.host, () => {
  const summary = redactedConfigSummary(config);
  console.log(
    `LinkWise backend listening on ${config.host}:${summary.port} (AI configured: ${summary.aiConfigured}, model: ${summary.model})`,
  );
  if (!summary.aiConfigured) {
    console.log("OPENAI_API_KEY is not set — /api/analyze-profile will respond with { status: \"not_configured\" }.");
  }
});
