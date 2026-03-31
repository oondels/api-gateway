import { vars } from "./config/dotenv";
import { createProxyMiddleware } from "http-proxy-middleware"

export const setupProxy = (app: any, server: any) => {
  app.use("/api/telas",
    createProxyMiddleware({
      target: vars.TELAS_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/telas": "" },
    })
  )

  app.use("/api/sobracorte",
    createProxyMiddleware({
      target: vars.SOBRACORTE_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/sobracorte": "" },
    })
  )

  app.use("/api/upload",
    createProxyMiddleware({
      target: vars.UPLOAD_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/upload": "" },
    })
  )

  app.use("/api/diesel",
    createProxyMiddleware({
      target: vars.DIESEL_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/diesel": "" },
    })
  )

  app.use("/api/porta-emerg",
    createProxyMiddleware({
      target: vars.PORTA_EMERG_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/porta-emerg": "" },
    })
  )

  app.use("/api/portaria",
    createProxyMiddleware({
      target: vars.PORTARIA_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/portaria": "" },
    })
  )

  app.use("/api/index-informativo",
    createProxyMiddleware({
      target: vars.INDEX_INFORMATIVO_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/index-informativo": "" },
    })
  )

  app.use("/api/automation",
    createProxyMiddleware({
      target: vars.AUTOMATION_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/automation": "" },
    })
  )

  app.use("/api/dp",
    createProxyMiddleware({
      target: vars.DP_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/dp": "" },
    })
  )

  app.use("/api/quimico",
    createProxyMiddleware({
      target: vars.QUIMICO_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/quimico": "" },
    })
  )

  app.use("/api/pcp",
    createProxyMiddleware({
      target: vars.PCP_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/pcp": "" },
    })
  )

  app.use("/api/refeitorio",
    createProxyMiddleware({
      target: vars.REFEITORIO_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/refeitorio": "" },
    })
  )

  app.use("/api/lean",
    createProxyMiddleware({
      target: vars.LEAN_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/lean": "" },
    })
  )

  app.use("/api/att-ota",
    createProxyMiddleware({
      target: vars.ATT_OTA_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api/att-ota": "" },
    })
  )

  app.use(
    "/api/",
    createProxyMiddleware({
      target: vars.MAIN_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
    })
  );
};
