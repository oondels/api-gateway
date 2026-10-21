import type { Express } from "express";
import { ServerResponse, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import type { GatewayConfig } from "./config/dotenv";
import { MAIN_SERVICE_ENV_KEY, ROUTE_DEFINITIONS, type ServiceEnvKey } from "./config/routes";

export type ProxyRoute = (typeof ROUTE_DEFINITIONS)[number];
export const PROXY_ROUTES: readonly ProxyRoute[] = ROUTE_DEFINITIONS;

const isTimeoutError = (error: Error, proxyTimeoutMs: number, elapsedMs: number | undefined): boolean => {
  const code = (error as NodeJS.ErrnoException).code ?? "";
  return ["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code) ||
    (proxyTimeoutMs > 0 && code === "ECONNRESET" && elapsedMs !== undefined && elapsedMs >= proxyTimeoutMs);
};

const sendStandardProxyError = (
  error: Error,
  _request: IncomingMessage,
  response: ServerResponse<IncomingMessage> | Socket,
  proxyTimeoutMs: number,
  elapsedMs: number | undefined,
) => {
  if (!(response instanceof ServerResponse)) {
    response.destroy();
    return;
  }

  if (response.headersSent) {
    response.end();
    return;
  }

  const timedOut = isTimeoutError(error, proxyTimeoutMs, elapsedMs);
  response.writeHead(timedOut ? 504 : 502, { "Content-Type": "application/json; charset=utf-8" });
  response.end(
    JSON.stringify({
      message: timedOut ? "Tempo limite ao acessar o serviço de destino." : "Serviço de destino indisponível.",
    }),
  );
};

export const findProxyRoute = (request: IncomingMessage): ProxyRoute | undefined => {
  const originalUrl = (request as IncomingMessage & { originalUrl?: string }).originalUrl;
  const pathnames = [originalUrl, request.url]
    .filter((pathname): pathname is string => Boolean(pathname))
    .map((pathname) => pathname.split("?", 1)[0]);
  return PROXY_ROUTES.find(({ prefix }) => {
    const relativePrefix = prefix.slice("/api".length);
    return pathnames.some((pathname) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`) ||
      pathname === relativePrefix || pathname.startsWith(`${relativePrefix}/`),
    );
  });
};

export const resolveProxyService = (request: IncomingMessage): ServiceEnvKey =>
  findProxyRoute(request)?.service ?? MAIN_SERVICE_ENV_KEY;

const rewritePath = (path: string, request: IncomingMessage): string => {
  const route = findProxyRoute(request);
  if (!route) {
    return path;
  }

  const relativePrefix = route.prefix.slice("/api".length);
  const prefix = path.startsWith(route.prefix) ? route.prefix : relativePrefix;
  const rewrittenPath = path.slice(prefix.length);
  return rewrittenPath === "" || rewrittenPath.startsWith("?") ? `/${rewrittenPath}` : rewrittenPath;
};

const createOptions = (config: GatewayConfig): Options => {
  const proxyStartTimes = new WeakMap<IncomingMessage, number>();
  const options: Options = {
    target: config.services.MAIN_SERVICE,
    router: (request) => {
      const route = findProxyRoute(request);
      return route ? config.services[route.service] : config.services.MAIN_SERVICE;
    },
    changeOrigin: true,
    pathRewrite: rewritePath,
    on: {
      proxyReq: (_proxyRequest, request) => {
        proxyStartTimes.set(request, Date.now());
      },
      error: (error, request, response) => {
        if (config.standardProxyErrorsEnabled) {
          const startedAt = proxyStartTimes.get(request);
          sendStandardProxyError(
            error,
            request,
            response,
            config.proxyTimeoutMs,
            startedAt === undefined ? undefined : Date.now() - startedAt,
          );
        }
      },
    },
  };

  if (config.proxyTimeoutMs > 0) {
    options.proxyTimeout = config.proxyTimeoutMs;
  }

  return options;
};

export const setupProxy = (app: Express, config: GatewayConfig): void => {
  app.use("/api", (request, response, next) => {
    if (config.strictRouteMode && !findProxyRoute(request)) {
      response.status(404).json({ message: "Rota não cadastrada no Gateway." });
      return;
    }
    const service = resolveProxyService(request);
    if (!config.services[service]) {
      response.status(503).json({ message: "Serviço de destino não configurado." });
      return;
    }
    next();
  });
  app.use(
    "/api",
    createProxyMiddleware(createOptions(config)),
  );
};

export const setupWebSocketProxy = (server: Server, config: GatewayConfig): void => {
  const proxy = createProxyMiddleware(createOptions(config));
  server.on("upgrade", (request, socket, head) => {
    if (findProxyRoute(request)?.service !== "ERP_MODELAGEM_SERVICE") {
      socket.destroy();
      return;
    }
    if (!config.services.ERP_MODELAGEM_SERVICE) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    proxy.upgrade(request, socket as Socket, head);
  });
};
