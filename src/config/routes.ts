export const MAIN_SERVICE_ENV_KEY = "MAIN_SERVICE" as const;

export const ROUTE_DEFINITIONS = [
  { prefix: "/api/erp-modelagem", service: "ERP_MODELAGEM_SERVICE" },
  { prefix: "/api/index-informativo", service: "INDEX_INFORMATIVO_SERVICE" },
  { prefix: "/api/telas", service: "TELAS_SERVICE" },
  { prefix: "/api/sobracorte", service: "SOBRACORTE_SERVICE" },
  { prefix: "/api/upload", service: "UPLOAD_SERVICE" },
  { prefix: "/api/diesel", service: "DIESEL_SERVICE" },
  { prefix: "/api/porta-emerg", service: "PORTA_EMERG_SERVICE" },
  { prefix: "/api/portaria", service: "PORTARIA_SERVICE" },
  { prefix: "/api/porta-rfid", service: "PORTA_RFID_SERVICE" },
  { prefix: "/api/automation", service: "AUTOMATION_SERVICE" },
  { prefix: "/api/dp", service: "DP_SERVICE" },
  { prefix: "/api/quimico", service: "QUIMICO_SERVICE" },
  { prefix: "/api/refeitorio", service: "REFEITORIO_SERVICE" },
  { prefix: "/api/att-ota", service: "ATT_OTA_SERVICE" },
  { prefix: "/api/solicitacao-brinde", service: "SOLICITACAO_BRINDE_SERVICE" },
  { prefix: "/api/almoxarifado-ti", service: "ALMOXARIFADO_TI" },
  { prefix: "/api/admin", service: "ADMIN_SERVICE" },
  { prefix: "/api/synapse-ti", service: "SYNAPSE_TI" },
  { prefix: "/api/pe-confirmado-teste", service: "PE_CONFIRMADO_TESTE" },
  { prefix: "/api/amostras-tintas", service: "AMOSTRAS_TINTAS" },
  { prefix: "/api/checklist-app", service: "CHECKLIST_APP_SERVICE" },
  { prefix: "/api/coletores", service: "COLETORES_SERVICE" }, 
  { prefix: "/api/certificados-dass", service: "CERTIFICADOS_DASS" },
  { prefix: "/api/formas-dass", service: "FORMAS_DASS" },
] as const;

export type RoutedServiceEnvKey = (typeof ROUTE_DEFINITIONS)[number]["service"];
export type ServiceEnvKey = typeof MAIN_SERVICE_ENV_KEY | RoutedServiceEnvKey;

export const SERVICE_ENV_KEYS: readonly ServiceEnvKey[] = [
  MAIN_SERVICE_ENV_KEY,
  ...ROUTE_DEFINITIONS.map(({ service }) => service),
];

interface RouteDefinition {
  prefix: string;
  service: string;
}

export const validateRouteRegistry = (routes: readonly RouteDefinition[]): void => {
  const errors: string[] = [];

  routes.forEach((route, index) => {
    if (!route.prefix.startsWith("/api/") || route.prefix.endsWith("/")) {
      errors.push(`Route ${index + 1} must use a non-empty /api/<prefix> path.`);
    }
    if (!route.service.trim()) {
      errors.push(`Route ${index + 1} must define a destination service.`);
    }

    const duplicateIndex = routes.findIndex(
      (candidate, candidateIndex) => candidateIndex < index && candidate.prefix === route.prefix,
    );
    if (duplicateIndex >= 0) {
      errors.push(`Route prefix ${route.prefix} is duplicated.`);
    }
  });

  routes.forEach((route, index) => {
    routes.forEach((candidate, candidateIndex) => {
      if (index === candidateIndex || route.prefix === candidate.prefix) {
        return;
      }

      const routeContainsCandidate = candidate.prefix.startsWith(`${route.prefix}/`);
      const candidateContainsRoute = route.prefix.startsWith(`${candidate.prefix}/`);
      if (routeContainsCandidate || candidateContainsRoute) {
        errors.push(`Route prefixes ${route.prefix} and ${candidate.prefix} are ambiguous.`);
      }
    });
  });

  if (errors.length > 0) {
    throw new Error(`Invalid gateway route registry:\n- ${[...new Set(errors)].join("\n- ")}`);
  }
};

validateRouteRegistry(ROUTE_DEFINITIONS);
