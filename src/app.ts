import type { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import type { GatewayConfig } from "./config/dotenv";
import { findProxyRoute, setupProxy } from "./proxy";

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

export interface GatewayLifecycle {
  isReady: () => boolean;
}

interface CreateAppOptions {
  logStream?: Writable | false;
  lifecycle?: GatewayLifecycle;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const classifyDestination = (request: Request): string => {
  const route = findProxyRoute(request);
  if (route) {
    return route.service;
  }
  const pathname = (request.originalUrl || request.url || "").split("?", 1)[0];
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return "MAIN_SERVICE";
  }
  return "GATEWAY";
};

morgan.token("path", (request) => {
  const originalUrl = (request as Request).originalUrl || request.url || "";
  return originalUrl.split("?", 1)[0];
});

morgan.token("request-id", (request) => String(request.headers["x-request-id"] ?? "-"));
morgan.token("destination", (request) => classifyDestination(request as Request));

export const createApp = (
  config: GatewayConfig,
  { logStream = process.stdout, lifecycle = { isReady: () => true } }: CreateAppOptions = {},
): Express => {
  const app = express();
  const allowedOrigins = [...new Set([...DEFAULT_CORS_ORIGINS, ...config.additionalCorsOrigins])];

  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(helmet());

  app.use((request: Request, response: Response, next) => {
    const receivedRequestId = request.get("x-request-id");
    const requestId = receivedRequestId && REQUEST_ID_PATTERN.test(receivedRequestId)
      ? receivedRequestId
      : randomUUID();
    request.headers["x-request-id"] = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  });

  if (logStream) {
    app.use(morgan(":method :path :status :response-time ms request_id=:request-id destination=:destination", { stream: logStream }));
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

  app.get("/health/live", (_request: Request, response: Response) => {
    response.json({ status: "ok" });
  });

  app.get("/health/ready", (_request: Request, response: Response) => {
    const ready = lifecycle.isReady();
    response.status(ready ? 200 : 503).json({ status: ready ? "ok" : "not_ready" });
  });

  setupProxy(app, config);

  app.get("/", (_request: Request, response: Response) => {
    response.json({ message: "Dass API Gateway is running!" });
  });

  return app;
};
