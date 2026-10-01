import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mountFrontend } from "./serve-frontend";

let directory: string;
let server: Server;
let origin: string;
const document = "<!doctype html><html><body>Rikki frontend test</body></html>";

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "rikki-frontend-"));
  await mkdir(path.join(directory, "assets"));
  await writeFile(path.join(directory, "index.html"), document);
  await writeFile(path.join(directory, "assets", "app.js"), "window.rikki = true;");
  await writeFile(path.join(directory, ".env"), "must-not-be-served");
  // Even a static file using a reserved backend path must remain inaccessible.
  await mkdir(path.join(directory, "api"));
  await writeFile(path.join(directory, "api", "static.txt"), "must-not-be-served");
  const app = express();
  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));
  mountFrontend(app, directory);
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("serves the home page and deep links without caching stale HTML", async () => {
  for (const route of ["/", "/client", "/client/account", "/admin"]) {
    const response = await fetch(origin + route, { headers: { Accept: "text/html" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.equal(await response.text(), document);
  }
});

test("serves real frontend assets", async () => {
  const response = await fetch(origin + "/assets/app.js");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /javascript/);
  assert.equal(await response.text(), "window.rikki = true;");
});

test("preserves API responses and does not turn missing backend paths into HTML", async () => {
  const response = await fetch(origin + "/api/healthz");
  assert.deepEqual(await response.json(), { status: "ok" });
  for (const route of ["/api", "/api/missing", "/api/__clerk/missing", "/api/static.txt", "/objects/missing"]) {
    const missing = await fetch(origin + route, { headers: { Accept: "text/html" } });
    assert.equal(missing.status, 404, route);
    assert.notEqual(await missing.text(), document);
  }
});

test("missing assets, dotfiles, and non-HTML requests do not get the SPA", async () => {
  for (const route of ["/assets/missing.js", "/assets/missing", "/brand/missing.svg", "/.env", "/.git/config"]) {
    const response = await fetch(origin + route, { headers: { Accept: "text/html" } });
    assert.equal(response.status, 404, route);
    assert.notEqual(await response.text(), document);
  }
  const json = await fetch(origin + "/missing", { headers: { Accept: "application/json" } });
  assert.equal(json.status, 404);
  const post = await fetch(origin + "/client", { method: "POST" });
  assert.equal(post.status, 404);
});

test("HEAD requests work for refreshed pages", async () => {
  const response = await fetch(origin + "/client/account", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("fails explicitly if the frontend was not built", () => {
  assert.throws(
    () => mountFrontend(express(), path.join(directory, "missing")),
    /Frontend build missing/,
  );
});