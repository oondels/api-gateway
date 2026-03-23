import express, { Request, Response, NextFunction } from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { vars } from "./src/config/dotenv";
import { setupProxy } from "./src/proxy";
import { ip } from "./src/config/ip";

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: ["http://localhost:5174", "http://192.168.26.90", "http://localhost", "http://localhost:5173", "http://10.100.1.43:5050",
    "http://10.100.1.43:3046", "http://10.100.1.43:9137", "http://10.100.1.43/replicacao-sest/telas-itb", "http://10.100.1.43", "http://localhost:3000", "http://10.110.21.53", "http://10.110.21.53:3000"], credentials: true
}));

app.use(helmet());
setupProxy(app, server);

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Dass API Gateway is running!" });
});

server.listen(vars.GATEWAY_PORT, () => {
  console.log(
    `Dass API Gateway running on http://${ip}:${vars.GATEWAY_PORT} in ${process.env.DEV_ENV ? "Development" : "Production"
    } mode.`
  );
});
