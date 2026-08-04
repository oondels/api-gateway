import type { Writable } from "node:stream";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import type { GatewayConfig } from "./config/dotenv";
import { setupProxy } from "./proxy";

export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5174",
  "http://192.168.26.90",
  "http://localhost",
  "http://localhost:5173",
  "http://10.100.1.43:5050",
  "http://10.100.1.43:3046",
  "http://10.100.1.43:9137",
  "http://10.100.1.43/replicacao-sest/telas-itb",
  "http://10.100.1.43",
  "http://localhost:3000",
  "http://10.110.21.53",
  "http://10.110.21.53:3000",
  "http://10.110.20.178:5173",
] as const;

interface CreateAppOptions {
  logStream?: Writable | false;
}

morgan.token("path", (request) => {
  const originalUrl = (request as Request).originalUrl || request.url || "";
  return originalUrl.split("?", 1)[0];
});

export const createApp = (config: GatewayConfig, { logStream = process.stdout }: CreateAppOptions = {}): Express => {
  const app = express();
  const allowedOrigins = [...new Set([...DEFAULT_CORS_ORIGINS, ...config.additionalCorsOrigins])];

  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(helmet());

  if (logStream) {
    app.use(morgan(":method :path :status :response-time ms", { stream: logStream }));
  }

  if (config.rateLimit.enabled) {
    app.use(
      "/api",
      rateLimit({
        windowMs: config.rateLimit.windowMs,
        limit: config.rateLimit.limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { message: "Você excedeu o limite de requisições. Tente novamente mais tarde." },
      }),
    );
  }

  setupProxy(app, config);

  app.get("/", (_request: Request, response: Response) => {
    response.json({ message: "Dass API Gateway is running!" });
  });

  return app;
};
