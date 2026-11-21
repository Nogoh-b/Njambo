import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function printMobileWifiUrls() {
  const nets = os.networkInterfaces();
  for (const [name, entries] of Object.entries(nets)) {
    if (/vmware|vmnet|vbox|vethernet|loopback/i.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        console.log(`\n📱 Test sur téléphone (${name}) : http://${entry.address}:3000 (ou :3001)\n`);
      }
    }
  }
}

printMobileWifiUrls();

/* Le backend tourne depuis server/dist (code compilé) : sans recompilation, une
   commande ajoutée côté serveur reste inconnue (404 UNKNOWN_COMMAND) jusqu'au
   prochain redémarrage. On compile donc au démarrage, puis tsc --watch
   recompile à chaque modification et node --watch relance le backend. */
const serverDir = path.join(root, "server");
const tsc = path.join(serverDir, "node_modules/typescript/bin/tsc");
console.log("\n🔧 Compilation du backend (server/dist)…");
const build = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: serverDir, stdio: "inherit", windowsHide: true });
if (build.status !== 0) console.warn("⚠️  Le backend a des erreurs de compilation : la dernière version compilée est utilisée en attendant.");

const processes = [
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(process.execPath, [tsc, "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"], {
    cwd: serverDir,
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(process.execPath, ["--watch", "--env-file=.env", "dist/server/src/index.js"], {
    cwd: serverDir,
    stdio: "inherit",
    windowsHide: true,
  }),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === "win32") {
      // Next.js starts workers; killing only its parent leaves ports occupied.
      const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      if (result.error || result.status !== 0) child.kill();
    } else {
      child.kill();
    }
  }
  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) stop(signal ? 1 : (code ?? 0));
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
