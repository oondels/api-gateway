import path from "path"
import dotenv from "dotenv";
const envFile = process.env.DEV_ENV ? ".env" : ".env.production";
dotenv.config({ path: path.resolve(__dirname, "../../", envFile) });

export const vars = {
  JWT_SECRET: process.env.JWT_SECRET,
  DEV_ENV: process.env.DEV_ENV,

  GATEWAY_PORT: process.env.GATEWAY_PORT,
  MAIN_SERVICE: process.env.MAIN_SERVICE,
  TELAS_SERVICE: process.env.TELAS_SERVICE,
};
