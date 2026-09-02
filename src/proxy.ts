import type { Express } from "express";
import { ServerResponse, type IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import type { GatewayConfig, ServiceEnvKey } from "./config/dotenv";

export interface ProxyRoute {
  prefix: string;
  service: ServiceEnvKey;
}

export const PROXY_ROUTES: readonly ProxyRoute[] = [
  { prefix: "/api/telas", service: "TELAS_SERVICE" },
  { prefix: "/api/sobracorte", service: "SOBRACORTE_SERVICE" },
  { prefix: "/api/upload", service: "UPLOAD_SERVICE" },
  { prefix: "/api/diesel", service: "DIESEL_SERVICE" },
  { prefix: "/api/porta-emerg", service: "PORTA_EMERG_SERVICE" },
  { prefix: "/api/portaria", service: "PORTARIA_SERVICE" },
  { prefix: "/api/index-informativo", service: "INDEX_INFORMATIVO_SERVICE" },
  { prefix: "/api/automation", service: "AUTOMATION_SERVICE" },
  { prefix: "/api/dp", service: "DP_SERVICE" },
  { prefix: "/api/quimico", service: "QUIMICO_SERVICE" },
  { prefix: "/api/pcp", service: "PCP_SERVICE" },
  { prefix: "/api/refeitorio", service: "REFEITORIO_SERVICE" },
  { prefix: "/api/lean", service: "LEAN_SERVICE" },
  { prefix: "/api/att-ota", service: "ATT_OTA_SERVICE" },
  { prefix: "/api/solicitacao-brinde", service: "SOLICITACAO_BRINDE_SERVICE" },
  { prefix: "/api/checklist-maquina", service: "CHECKLIST_MAQUINA_SERVICE" },
  { prefix: "/api/almoxarifado-ti", service: "ALMOXARIFADO_TI" },
  { prefix: "/api/dass-users", service: "DASS_USERS" },
  { prefix: "/api/synapse-ti", service: "SYNAPSE_TI" },
  { prefix: "/api/pe-confirmado-teste", service: "PE_CONFIRMADO_TESTE" },
  { prefix: "/api/amostras-tintas", service: "AMOSTRAS_TINTAS" },
  { prefix: "/api/checklist-app", service: "CHECKLIST_APP_SERVICE" },
] as const;

const isTimeoutError = (error: Error, proxyTimeoutConfigured: boolean): boolean => {
  const code = (error as NodeJS.ErrnoException).code ?? "";
  return ["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code) || (proxyTimeoutConfigured && code === "ECONNRESET");
};

const sendStandardProxyError = (
  error: Error,
  _request: IncomingMessage,
  response: ServerResponse<IncomingMessage> | Socket,
  proxyTimeoutConfigured: boolean,
) => {
  if (!(response instanceof ServerResponse)) {
    response.destroy();
    return;
  }

  if (response.headersSent) {
    response.end();
    return;
  }

  const timedOut = isTimeoutError(error, proxyTimeoutConfigured);
  response.writeHead(timedOut ? 504 : 502, { "Content-Type": "application/json; charset=utf-8" });
  response.end(
    JSON.stringify({
      message: timedOut ? "Tempo limite ao acessar o serviço de destino." : "Serviço de destino indisponível.",
    }),
  );
};

const findProxyRoute = (request: IncomingMessage): ProxyRoute | undefined => {
  const pathname = (request.url ?? "").split("?", 1)[0];
  return PROXY_ROUTES.find(({ prefix }) => {
    const relativePrefix = prefix.slice("/api".length);
    return pathname === relativePrefix || pathname.startsWith(`${relativePrefix}/`);
  });
};

const rewritePath = (path: string, request: IncomingMessage): string => {
  const route = findProxyRoute(request);
  if (!route) {
    return path;
  }

  const relativePrefix = route.prefix.slice("/api".length);
  const rewrittenPath = path.slice(relativePrefix.length);
  return rewrittenPath === "" || rewrittenPath.startsWith("?") ? `/${rewrittenPath}` : rewrittenPath;
};

const createOptions = (config: GatewayConfig): Options => {
  const options: Options = {
    target: config.services.MAIN_SERVICE,
    router: (request) => {
      const route = findProxyRoute(request);
      return route ? config.services[route.service] : config.services.MAIN_SERVICE;
    },
    changeOrigin: true,
    pathRewrite: rewritePath,
  };

  if (config.proxyTimeoutMs > 0) {
    options.proxyTimeout = config.proxyTimeoutMs;
  }

  if (config.standardProxyErrorsEnabled) {
    options.on = {
      error: (error, request, response) =>
        sendStandardProxyError(error, request, response, config.proxyTimeoutMs > 0),
    };
  }

  return options;
};

export const setupProxy = (app: Express, config: GatewayConfig): void => {
  app.use(
    "/api",
    createProxyMiddleware(createOptions(config)),
  );
};
