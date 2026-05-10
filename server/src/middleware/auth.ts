import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

type JwtUserPayload = jwt.JwtPayload & {
  userId: number;
};

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader === undefined || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (token === "") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (secret === undefined || secret === "") {
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== "object" || decoded === null) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    const payload = decoded as JwtUserPayload;
    if (typeof payload.userId !== "number") {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    res.locals.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
