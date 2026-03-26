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

  app.use(
    "/api/",
    createProxyMiddleware({
      target: vars.MAIN_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
    })
  );
};
