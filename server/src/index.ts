import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getApps, initializeApp } from "firebase-admin/app";
import express from "express";
import cors from "cors";
import { setDbBackend } from "../../functions/src/core";
import { createPgFirestore } from "./firestoreCompat/pg";
import { buildCallableRequest } from "./auth";
import { commands } from "./routes";
import { sendError } from "./httpError";
import { startJobs } from "./jobs";
import { attachRealtime } from "./realtime/server";

/* Charge server/.env s'il existe (DATABASE_URL, PORT, GOOGLE_APPLICATION_
   CREDENTIALS…). Les variables déjà présentes dans l'environnement priment —
   un déploiement systemd/PM2 qui injecte ses vars n'est pas affecté. */
function loadDotEnv() {
  // __dirname compilé = server/dist/server/src → ../../.. = server/
  for (const candidate of [resolve(__dirname, "../../../.env"), resolve(process.cwd(), ".env")]) {
    let content: string;
    try { content = readFileSync(candidate, "utf8"); } catch { continue; }
    for (const line of content.split(/\r?\n/)) {
      const matched = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!matched || line.trimStart().startsWith("#")) continue;
      const key = matched[1];
      const value = matched[2].replace(/^["']|["']$/g, "");
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return;
  }
}
loadDotEnv();

if (getApps().length === 0) initializeApp();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/api/:command", async (req, res) => {
  const handler = commands[req.params.command];
  if (!handler) {
    res.status(404).json({ code: "not-found", message: "UNKNOWN_COMMAND" });
    return;
  }
  try {
    const request = await buildCallableRequest(req.header("authorization"), req.body ?? {});
    const result = await handler(request);
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

async function main() {
  /* Backend de persistance : Postgres si DATABASE_URL est défini (cible VPS),
     sinon Firestore via firebase-admin (utile en transition/développement). */
  if (process.env.DATABASE_URL) {
    setDbBackend(await createPgFirestore(process.env.DATABASE_URL));
    console.log("njambo-server: backend Postgres");
  } else {
    console.log("njambo-server: backend Firestore (DATABASE_URL absent)");
  }

  const httpServer = createServer(app);
  attachRealtime(httpServer);

  const port = Number(process.env.PORT ?? 8081);
  httpServer.listen(port, () => {
    console.log(`njambo-server listening on :${port} (HTTP + WebSocket /ws)`);
    startJobs();
  });
}

main().catch((error) => {
  console.error("njambo-server bootstrap failed", error);
  process.exit(1);
});
