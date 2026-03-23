import { vars } from "./config/dotenv";
import { createProxyMiddleware } from "http-proxy-middleware"
const mainInstances = [vars.MAIN_SERVICE];
import {Request, Response, NextFunction} from "express";

let mainIndex = 0;

const getNextInstance = (instances: any, index: any) => {
  const next = instances[index % instances.length];
  return { next, newIndex: index + 1 };
};

// Configurar depois para uso do app de mensagens

export const setupLoadBalancer = (app: any) => {
  app.use("/api/", (req: Request, res: Response, next: NextFunction) => {
    const { next: target, newIndex } = getNextInstance(mainInstances, mainIndex);
    mainIndex = newIndex;
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })(req, res, next);
  });
};
