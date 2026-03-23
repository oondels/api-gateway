import { vars } from "./config/dotenv";
import { createProxyMiddleware } from "http-proxy-middleware"

export const setupProxy = (app: any, server: any) => {
  app.use(
    "/api/",
    createProxyMiddleware({
      target: vars.MAIN_SERVICE,
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
    })
  );
};
