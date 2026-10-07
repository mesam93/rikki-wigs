import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { fileURLToPath } from "node:url";
import { mountFrontend } from "./lib/serve-frontend";
import { googleSessionMiddleware } from "./auth/google-session";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required");
}
app.use(cookieParser(sessionSecret));
app.use("/api", googleSessionMiddleware());

app.use("/api", router);

// Opt-in for a single Railway service. Replit keeps its separate web/API services.
if (process.env.SERVE_FRONTEND === "true") {
  mountFrontend(app, fileURLToPath(new URL("./public/", import.meta.url)));
}

export default app;
