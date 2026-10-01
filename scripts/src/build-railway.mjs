import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const env = {
  ...process.env,
  NODE_ENV: "production",
  // Vite needs these while loading its config, even for a static build.
  PORT: process.env.PORT || "8080",
  BASE_PATH: "/",
};

for (const args of [
  ["--filter", "@workspace/rikki-wigs", "run", "build"],
  ["--filter", "@workspace/api-server", "run", "build", "--with-frontend"],
]) {
  try {
    execFileSync("pnpm", args, { cwd: root, env, stdio: "inherit" });
  } catch (error) {
    process.exit(error.status || 1);
  }
}