import path from "node:path";
import dotenv from "dotenv";

export const SERVICE_ENV_KEYS = [
  "INDEX_INFORMATIVO_SERVICE",
  "TELAS_SERVICE",
  "SOBRACORTE_SERVICE",
  "UPLOAD_SERVICE",
  "DIESEL_SERVICE",
  "PORTA_EMERG_SERVICE",
  "PORTARIA_SERVICE",
  "PORTA_RFID_SERVICE",
  "AUTOMATION_SERVICE",
  "DP_SERVICE",
  "QUIMICO_SERVICE",
  "REFEITORIO_SERVICE",
  "ATT_OTA_SERVICE",
  "SOLICITACAO_BRINDE_SERVICE",
  "ALMOXARIFADO_TI",
  "DASS_USERS",
  "SYNAPSE_TI",
  "MAIN_SERVICE",
  "PE_CONFIRMADO_TESTE",
  "AMOSTRAS_TINTAS",
  "CHECKLIST_APP_SERVICE",
] as const;

export type ServiceEnvKey = (typeof SERVICE_ENV_KEYS)[number];

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
    if (!value) {
      errors.push(`${key} is required.`);
      continue;
    }
    services[key] = value;
  }

  let port = 0;
  let rateLimitEnabled = false;
  let rateLimitWindowMs = 900_000;
  let rateLimitMax = 100;
  let proxyTimeoutMs = 0;
  let standardProxyErrorsEnabled = false;

  const capture = (parser: () => void) => {
    try {
      parser();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  };

  capture(() => {
    port = parseInteger(env.GATEWAY_PORT, undefined, "GATEWAY_PORT", 1, 65_535);
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
    proxyTimeoutMs = parseInteger(env.PROXY_TIMEOUT_MS, 0, "PROXY_TIMEOUT_MS", 0);
  });
  capture(() => {
    standardProxyErrorsEnabled = parseBoolean(
      env.STANDARD_PROXY_ERRORS_ENABLED,
      false,
      "STANDARD_PROXY_ERRORS_ENABLED",
    );
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
  };
};
