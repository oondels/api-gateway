/// <reference path="../types/express.d.ts" />

import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { vars } from "../config/dotenv";

const PRIVATE_KEY = vars.JWT_SECRET as string;

export interface DecodedToken {
  id: string;
  usuario: string;
  codbarras: string;
  rfid: string;
  matricula: string;
  setor: string;
  nivel: string;
  unidade: string;
  funcao: string;
}

const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token
  if (!token) {
    res.status(401).json({ message: "Acesso negado! Token de acesso não fornecido!" });
    return;
  }

  jwt.verify(token, PRIVATE_KEY, async (error: jwt.VerifyErrors | null, decoded: jwt.JwtPayload | string | undefined) => {
    if (error || !decoded) {
      res.status(401).json({
        message: "Acesso negado! Você não tem permissões para acessar essa rota!",
      });
      return;
    }

    req.user = decoded as DecodedToken;
    next();
  });
};

export { PRIVATE_KEY, verifyToken };
