import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const options = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1] ?? true]);
    return pairs;
  }, []),
);

const chromePath = options.chrome ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const production = options.production === "true";
const serverPort = Number(options["server-port"] ?? 3100);
const url = options.url ?? `http://127.0.0.1:${production ? serverPort : 3000}`;
const width = Number(options.width ?? 390);
const height = Number(options.height ?? 844);
const outDir = path.resolve(options["out-dir"] ?? "tmp/qa");
const homeOnly = options["home-only"] === "true";
const port = 9300 + Math.floor(Math.random() * 300);
const profile = path.resolve(`tmp/chrome-cdp-${port}`);

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(profile, { recursive: true });

let server;
if (production) {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(serverPort)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch {
      // Le serveur Next prépare ses routes de production.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const chrome = spawn(chromePath, [
  "--headless=new",
  "--no-first-run",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

let chromeError = "";
chrome.stderr.setEncoding("utf8");
chrome.stderr.on("data", (chunk) => { chromeError += chunk; });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollJson(endpoint, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`);
      if (response.ok) return response.json();
    } catch {
      // Chrome ouvre le port après l'initialisation de son profil.
    }
    await delay(100);
  }
  throw new Error(`Chrome DevTools indisponible sur ${port}. ${chromeError.slice(-1200)}`);
}

let socket;
try {
  const targets = await pollJson("/json/list");
  const pageTarget = targets.find((target) => target.type === "page");
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error("Aucune page Chrome disponible");

  socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  const browserEvents = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown" || message.method === "Network.loadingFailed") {
      browserEvents.push({ method: message.method, params: message.params });
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 900,
    screenWidth: width,
    screenHeight: height,
  });
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Page.bringToFront");
  await send("Page.navigate", { url });
  await send("Page.setWebLifecycleState", { state: "active" });
  await delay(8_000);

  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Évaluation navigateur impossible");
    return result.result?.value;
  };

  const capture = async (name) => {
    await delay(900);
    const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    await fs.writeFile(path.join(outDir, `${name}-${width}x${height}.png`), Buffer.from(screenshot.data, "base64"));
    const metrics = await evaluate(`(() => {
      const dock = document.querySelector('nav[aria-label="Menu principal"]');
      const scroll = document.querySelector('.nj-bottom-nav-scene-scroll');
      const active = dock?.querySelector('[aria-current="page"]')?.getAttribute('aria-label') ?? null;
      const rect = dock?.getBoundingClientRect();
      const visible = (node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const smallTargets = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"]')]
        .filter(visible)
        .map((node) => {
          const box = node.getBoundingClientRect();
          return {
            label: node.getAttribute('aria-label') || node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 70) || node.tagName,
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44);
      return {
        scene: active,
        bodyText: document.body.innerText.slice(0, 180),
        readyState: document.readyState,
        visibility: document.visibilityState,
        hydrated: [...document.querySelectorAll('*')].some((node) => Object.keys(node).some((key) => key.startsWith('__reactFiber'))),
        scripts: [...document.scripts].filter((item) => item.src).length,
        fonts: {
          body: getComputedStyle(document.body).fontFamily,
          heading: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).fontFamily : null,
        },
        resources: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/_next/')).slice(-8).map((entry) => ({ name: entry.name.split('/').pop(), size: entry.transferSize })),
        viewport: { width: innerWidth, height: innerHeight },
        dock: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height), position: getComputedStyle(dock).position } : null,
        scroll: scroll ? { clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight, overflowY: getComputedStyle(scroll).overflowY } : null,
        smallTargets,
      };
    })()`);
    console.log(JSON.stringify({ capture: name, ...metrics, browserEvents: browserEvents.slice(-5) }));
  };

  const clickDock = async (label) => {
    const clicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('nav[aria-label="Menu principal"] button')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)});
      button?.click();
      return Boolean(button);
    })()`);
    if (!clicked) throw new Error(`Onglet introuvable : ${label}`);
    await delay(900);
  };

  const clickButton = async ({ ariaLabel, ariaPrefix, text }) => {
    const clicked = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('button')];
      const button = buttons.find((item) => {
        const label = item.getAttribute('aria-label') ?? '';
        const copy = item.textContent?.trim().replace(/\\s+/g, ' ') ?? '';
        return ${JSON.stringify(ariaLabel ?? null)} ? label === ${JSON.stringify(ariaLabel ?? "")} :
          ${JSON.stringify(ariaPrefix ?? null)} ? label.startsWith(${JSON.stringify(ariaPrefix ?? "")}) :
          copy.includes(${JSON.stringify(text ?? "")});
      });
      button?.click();
      return Boolean(button);
    })()`);
    if (!clicked) throw new Error(`Bouton introuvable : ${ariaLabel ?? ariaPrefix ?? text}`);
    await delay(900);
  };

  await capture("home");
  if (!homeOnly) {
    await clickDock("Jouer");
    await capture("play");
    await clickDock("Événements");
    await capture("events");
    await clickDock("Boutique");
    await capture("shop");
    await clickDock("Social");
    await capture("social");
    await clickDock("Accueil");
    await clickButton({ ariaLabel: "Réglages" });
    await capture("options");
    await clickButton({ ariaLabel: "Retour" });
    const walletOpened = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label')?.startsWith('Nkap :'));
      button?.click();
      return Boolean(button);
    })()`);
    if (!walletOpened) throw new Error("Raccourci Portefeuille introuvable");
    await capture("wallet");
    await clickButton({ ariaLabel: "Retour" });
    await clickDock("Jouer");
    await clickButton({ ariaPrefix: "Jouer à Contre l’IA" });
    await capture("bot-setup");
    await clickButton({ text: "À la table" });
    await delay(1_500);
    await capture("table");
  }
} finally {
  socket?.close();
  chrome.kill();
  server?.kill();
}

process.exit(0);
