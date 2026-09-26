// The Express app factory, separate from index.ts's listen() so tests can hit it without
// binding a real port.
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { loadConfig, redactedConfigSummary, type BackendConfig } from "./config";
import { handleAnalyzeProfile } from "./routes/analyzeProfile";
import { handleGenerateCriteria } from "./routes/generateCriteria";
import { handleAnalyzeSignals } from "./routes/analyzeSignals";
import type { AnalysisClient } from "./openai/client";
import type { CriteriaGenerationClient } from "./openai/criteriaClient";
import type { SignalAnalysisClient } from "./openai/signalsClient";

export interface CreateAppOptions {
  config?: BackendConfig;
  /** Injected only in tests. */
  client?: AnalysisClient;
  /** Injected only in tests. */
  criteriaClient?: CriteriaGenerationClient;
  signalClient?: SignalAnalysisClient;
  timeoutMs?: number;
}

// Big enough for a real profile, small enough to stop an abusive body before JSON parsing.
const MAX_BODY_SIZE = "1mb";

export function createApp(options: CreateAppOptions = {}): Express {
  const config = options.config ?? loadConfig();
  const app = express();

  // Permissive CORS is fine for now, a local-only backend with no sensitive data. Tighten
  // this to the extension's own origin before any real deployment.
  app.use(cors());
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json(redactedConfigSummary(config));
  });

  app.post("/api/analyze-profile", (req: Request, res: Response) => {
    void handleAnalyzeProfile(req, res, { config, client: options.client, timeoutMs: options.timeoutMs });
  });

  app.post("/api/generate-criteria", (req: Request, res: Response) => {
    void handleGenerateCriteria(req, res, { config, client: options.criteriaClient, timeoutMs: options.timeoutMs });
  });

  app.post("/api/analyze-signals", (req: Request, res: Response) => {
    void handleAnalyzeSignals(req, res, { config, client: options.signalClient, timeoutMs: options.timeoutMs });
  });

  // Catches malformed JSON. Never leak the raw parser error to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err) {
      res.status(400).json({ status: "invalid_request", message: "The request body could not be parsed." });
      return;
    }
    res.status(500).json({ status: "unavailable", reason: "internal_error" });
  });

  return app;
}

export type { BackendConfig };
