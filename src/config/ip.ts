import {vars} from "./dotenv"

export const ip = vars.DEV_ENV ? "localhost" : "10.100.1.43";
