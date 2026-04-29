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
  SOBRACORTE_SERVICE: process.env.SOBRACORTE_SERVICE,
  UPLOAD_SERVICE: process.env.UPLOAD_SERVICE,
  DIESEL_SERVICE: process.env.DIESEL_SERVICE,
  SOLICITACAO_BRINDE_SERVICE: process.env.SOLICITACAO_BRINDE_SERVICE,
  PORTA_EMERG_SERVICE: process.env.PORTA_EMERG_SERVICE,
  PORTARIA_SERVICE: process.env.PORTARIA_SERVICE,
  INDEX_INFORMATIVO_SERVICE: process.env.INDEX_INFORMATIVO_SERVICE,
  AUTOMATION_SERVICE: process.env.AUTOMATION_SERVICE,
  DP_SERVICE: process.env.DP_SERVICE,
  QUIMICO_SERVICE: process.env.QUIMICO_SERVICE,
  PCP_SERVICE: process.env.PCP_SERVICE,
  REFEITORIO_SERVICE: process.env.REFEITORIO_SERVICE,
  LEAN_SERVICE: process.env.LEAN_SERVICE,
  ATT_OTA_SERVICE: process.env.ATT_OTA_SERVICE,
CHECKLIST_MAQUINA_SERVICE: process.env.CHECKLIST_MAQUINA_SERVICE,
};
