import { spawn } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("npm_execpath absent : lance ce script avec `npm run dev`.");
}

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
