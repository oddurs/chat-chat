/**
 * Emits the data the client needs at runtime. Everything else is baked into the pages at build
 * time; these two are fetched on demand so they do not bloat every page:
 *   search.json         — every turn, for the search box
 *   conversations/*.json — one file per conversation, for the compare view
 */
import fs from "node:fs";
import path from "node:path";

const LOGS = process.env.CHATCHAT_LOGS ?? path.join(process.cwd(), "..", "logs");
const OUT = path.join(process.cwd(), "public", "data");

function parse(file) {
  const turns = [];
  let config = null;
  let seed = "";
  let started = "";
  let stopReason = "running";
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type === "meta") {
      config = rec.config;
      seed = rec.seed ?? rec.config?.seed ?? rec.config?.seeds?.[0] ?? "";
      started = rec.started;
    } else if (rec.type === "turn") turns.push(rec);
    else if (rec.type === "end") stopReason = rec.stop_reason;
  }
  return config ? { config, seed, started, stopReason, turns } : null;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "conversations"), { recursive: true });

const search = [];
let n = 0;

for (const file of fs.existsSync(LOGS) ? fs.readdirSync(LOGS) : []) {
  if (!file.endsWith(".jsonl")) continue;
  const id = path.basename(file, ".jsonl");
  const c = parse(path.join(LOGS, file));
  if (!c) continue;
  n++;

  const analysisPath = path.join(LOGS, `${id}.analysis.json`);
  let analysis = null;
  try {
    analysis = JSON.parse(fs.readFileSync(analysisPath, "utf8"));
  } catch {}

  fs.writeFileSync(
    path.join(OUT, "conversations", `${id}.json`),
    JSON.stringify({ id, ...c, analysis }),
  );

  for (const t of c.turns) {
    search.push({
      id,
      config: c.config.name ?? id,
      idx: t.idx,
      name: t.name,
      model: t.model,
      content: t.content,
    });
  }
}

fs.writeFileSync(path.join(OUT, "search.json"), JSON.stringify(search));
console.log(`data: ${n} conversations, ${search.length} turns → public/data`);
