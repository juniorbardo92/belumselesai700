import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_LEDGER_BYTES = 5 * 1024 * 1024;

export function resolveLedgerPath(config = {}) {
  if (config.ledgerPath) return path.resolve(String(config.ledgerPath));
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "plugin-state", "kalyanamitra-content-os", "ledger.ndjson");
}

export async function appendLedgerEntry(entry, config = {}) {
  const ledgerPath = resolveLedgerPath(config);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true, mode: 0o700 });
  const row = {
    schemaVersion: 1,
    contentItemId: entry.contentItemId,
    displayId: entry.displayId,
    title: entry.title,
    metadata: entry.metadata,
    recordedAt: new Date().toISOString()
  };
  await fs.appendFile(ledgerPath, JSON.stringify(row) + "\n", {
    encoding: "utf8",
    mode: 0o600,
    flag: "a"
  });
  return row;
}

export async function getLedgerEntry(contentItemId, config = {}) {
  const ledgerPath = resolveLedgerPath(config);
  let stat;
  try {
    stat = await fs.stat(ledgerPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (stat.size > MAX_LEDGER_BYTES) {
    throw new Error("Ledger Kalyanamitra melebihi batas 5 MB; akses dihentikan.");
  }
  const text = await fs.readFile(ledgerPath, "utf8");
  let found = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error("Ledger Kalyanamitra rusak; akses dihentikan secara fail-closed.");
    }
    if (row?.contentItemId === contentItemId) found = row;
  }
  return found;
}
