import path from "node:path";
import dotenv from "dotenv";
import { SERVICE_ENV_KEYS, type ServiceEnvKey } from "./routes";

export { SERVICE_ENV_KEYS } from "./routes";
export type { ServiceEnvKey } from "./routes";

export interface GatewayConfig {
  port: number;
  services: Record<ServiceEnvKey, string>;
  additionalCorsOrigins: string[];
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    limit: number;
  };
  proxyTimeoutMs: number;
  standardProxyErrorsEnabled: boolean;
  strictRouteMode: boolean;
}

interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  loadEnvFile?: boolean;
}

const parseBoolean = (value: string | undefined, defaultValue: boolean, key: string): boolean => {
  if (value === undefined || value === "") {
    return defaultValue;
  }
  if (["true", "1"].includes(value.toLowerCase())) {
    return true;
  }
  if (["false", "0"].includes(value.toLowerCase())) {
    return false;
  }
  throw new Error(`${key} must be true, false, 1 or 0.`);
};

const parseInteger = (
  value: string | undefined,
  defaultValue: number | undefined,
  key: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  const normalizedValue = value === undefined || value === "" ? defaultValue : Number(value);

  if (
    normalizedValue === undefined ||
    !Number.isInteger(normalizedValue) ||
    normalizedValue < minimum ||
    normalizedValue > maximum
  ) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}.`);
  }

  return normalizedValue;
};

export const loadConfig = ({ env = process.env, loadEnvFile = true }: LoadConfigOptions = {}): GatewayConfig => {
  if (loadEnvFile) {
    dotenv.config({
      path: path.resolve(process.cwd(), ".env"),
      processEnv: env,
      quiet: true,
    });
  }

  const errors: string[] = [];
  const services = {} as Record<ServiceEnvKey, string>;

  for (const key of SERVICE_ENV_KEYS) {
    const value = env[key]?.trim();
    if (!value && key === "MAIN_SERVICE") {
      errors.push(`${key} is required.`);
    }
    services[key] = value || "";
  }

  let port = 2399;
  let rateLimitEnabled = false;
  let rateLimitWindowMs = 900_000;
  let rateLimitMax = 100;
  let proxyTimeoutMs = 30_000;
  let standardProxyErrorsEnabled = true;
  let strictRouteMode = false;

  const capture = (parser: () => void) => {
    try {
      parser();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  };

  capture(() => {
    port = parseInteger(env.GATEWAY_PORT, 2399, "GATEWAY_PORT", 1, 65_535);
  });
  capture(() => {
    rateLimitEnabled = parseBoolean(env.RATE_LIMIT_ENABLED, false, "RATE_LIMIT_ENABLED");
  });
  capture(() => {
    rateLimitWindowMs = parseInteger(env.RATE_LIMIT_WINDOW_MS, 900_000, "RATE_LIMIT_WINDOW_MS", 1);
  });
  capture(() => {
    rateLimitMax = parseInteger(env.RATE_LIMIT_MAX, 100, "RATE_LIMIT_MAX", 1);
  });
  capture(() => {
    proxyTimeoutMs = parseInteger(env.PROXY_TIMEOUT_MS, 30_000, "PROXY_TIMEOUT_MS", 0);
  });
  capture(() => {
    standardProxyErrorsEnabled = parseBoolean(
      env.STANDARD_PROXY_ERRORS_ENABLED,
      true,
      "STANDARD_PROXY_ERRORS_ENABLED",
    );
  });
  capture(() => {
    strictRouteMode = parseBoolean(env.STRICT_ROUTE_MODE, false, "STRICT_ROUTE_MODE");
  });

  if (errors.length > 0) {
    throw new Error(`Invalid gateway configuration:\n- ${errors.join("\n- ")}`);
  }

  const additionalCorsOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    services,
    additionalCorsOrigins,
    rateLimit: {
      enabled: rateLimitEnabled,
      windowMs: rateLimitWindowMs,
      limit: rateLimitMax,
    },
    proxyTimeoutMs,
    standardProxyErrorsEnabled,
    strictRouteMode,
  };
};
