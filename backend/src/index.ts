// Bootstraps the LinkWise backend — separate from app.ts's `createApp()` so tests can exercise
// the app without ever binding a real port.
import { createApp } from "./app";
import { loadConfig, redactedConfigSummary } from "./config";

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  const summary = redactedConfigSummary(config);
  console.log(
    `LinkWise backend listening on port ${summary.port} (AI configured: ${summary.aiConfigured}, model: ${summary.model})`,
  );
  if (!summary.aiConfigured) {
    console.log("OPENAI_API_KEY is not set — /api/analyze-profile will respond with { status: \"not_configured\" }.");
  }
});
