import express, {Request, Response, NextFunction} from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { vars } from "./src/config/dotenv";
import { setupProxy } from "./src/proxy";
import { ip } from "./src/config/ip";

const app = express();
const server = http.createServer(app);

app.use(cors());
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
