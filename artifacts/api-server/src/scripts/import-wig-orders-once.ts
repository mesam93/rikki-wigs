import { execFileSync } from "node:child_process";
import { pool } from "@workspace/db";
import { parseHistoricalWorkbook } from "../lib/wig-import";
import { applyHistoricalImport, inspectHistoricalImport } from "../lib/wig-import-run";

async function main() {
  const archive = process.argv[2] === "--" ? process.argv[3] : process.argv[2];
  if (!archive?.endsWith(".zip")) throw new Error("Pass the path to the supplied ZIP archive");
  const workbook = execFileSync("unzip", ["-p", archive, "Orders.xlsx"], { maxBuffer: 20 * 1024 * 1024 });
  const orders = await parseHistoricalWorkbook(workbook);
  if (!process.argv.includes("--apply")) {
    process.stdout.write(`${JSON.stringify(await inspectHistoricalImport(orders))}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await applyHistoricalImport(orders))}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "Import failed"}\n`);
  process.exitCode = 1;
}).finally(() => pool.end());