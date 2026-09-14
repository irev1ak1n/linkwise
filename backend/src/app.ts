// The Express app factory — separated from index.ts's `listen()` call specifically so tests can
// exercise real HTTP requests (via supertest-style fetch-to-a-listening-instance, or Express's
// own request/response test doubles) without ever binding a port.
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { loadConfig, redactedConfigSummary, type BackendConfig } from "./config";
import { handleAnalyzeProfile } from "./routes/analyzeProfile";
import { handleGenerateCriteria } from "./routes/generateCriteria";
import type { AnalysisClient } from "./openai/client";
import type { CriteriaGenerationClient } from "./openai/criteriaClient";

export interface CreateAppOptions {
  config?: BackendConfig;
  /** Injected only in tests. */
  client?: AnalysisClient;
  /** Injected only in tests. */
  criteriaClient?: CriteriaGenerationClient;
  timeoutMs?: number;
}

/** Generous enough for any real profile's evidence list, small enough that a malicious or
 * broken client can't tie up the process parsing an enormous body. Zod's own per-field limits
 * (see validation/requestSchema.ts) are the finer-grained cap; this is the coarse first line of
 * defense before JSON parsing even happens. */
const MAX_BODY_SIZE = "1mb";

export function createApp(options: CreateAppOptions = {}): Express {
  const config = options.config ?? loadConfig();
  const app = express();

  // Permissive CORS is fine for this milestone: a local-only backend the user's own extension
  // calls from their own machine, with no sensitive data or write access behind it. Tighten
  // this (e.g. to the specific chrome-extension://<id> origin) before any real deployment.
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

  // Catches express.json()'s own parse failure on malformed JSON — never leak the raw parser
  // error (which can quote back parts of the offending body) to the client.
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
