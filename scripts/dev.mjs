import { spawn } from "node:child_process";
import os from "node:os";
import process from "node:process";

const root = process.cwd();
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("npm_execpath absent : lance ce script avec `npm run dev`.");
}

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

const processes = [
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(process.execPath, [npmCli, "--prefix", "server", "run", "dev"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  }),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
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
