import app from "./app";
import { logger } from "./lib/logger";
import { reconcileCalendarInBackground } from "./lib/calendar-sync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  const reconcile = () => void reconcileCalendarInBackground().catch((error: unknown) => {
    logger.error({ error }, "Calendar reconciliation failed");
  });
  reconcile();
  setInterval(reconcile, 60_000).unref();
});
