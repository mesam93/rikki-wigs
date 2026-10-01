import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";

export function mountFrontend(app: Express, publicDir: string): void {
  const directory = path.resolve(publicDir);
  const indexFile = path.join(directory, "index.html");
  if (!existsSync(indexFile)) {
    throw new Error("Frontend build missing. Run pnpm run build:railway before start:railway.");
  }

  const frontend = express.Router();
  frontend.use(express.static(directory, { index: false, dotfiles: "ignore" }));
  frontend.get("/{*page}", (req, res, next) => {
    // Missing assets and non-HTML requests must not receive the SPA document.
    if (
      path.posix.extname(req.path) ||
      req.path === "/assets" ||
      req.path.startsWith("/assets/") ||
      req.path.split("/").some((segment) => segment.startsWith(".")) ||
      !req.accepts("html")
    ) {
      next();
      return;
    }
    res.sendFile(indexFile, { headers: { "Cache-Control": "no-cache" } });
  });

  app.use((req, res, next) => {
    // Preserve backend 404s and authentication proxy paths.
    if (/^\/(?:api|objects)(?:\/|$)/.test(req.path)) {
      next();
      return;
    }
    frontend(req, res, next);
  });
}