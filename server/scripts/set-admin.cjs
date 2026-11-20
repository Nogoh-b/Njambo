/* Attribue (ou retire) le custom claim Firebase `admin` à un compte.
   Usage (depuis server/, avec les identifiants du service account) :
     node scripts/set-admin.cjs <email|uid>            → donne les droits admin
     node scripts/set-admin.cjs <email|uid> --remove   → retire les droits
     node scripts/set-admin.cjs --list                 → liste les admins
   Identifiants : GOOGLE_APPLICATION_CREDENTIALS (chargé depuis server/.env s'il existe).
   Le joueur doit se reconnecter (ou rafraîchir son jeton) pour que le claim s'applique. */
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

for (const file of [resolve(__dirname, "../.env"), resolve(process.cwd(), ".env")]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    break;
  } catch { /* fichier absent */ }
}

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const [target, flag] = process.argv.slice(2);
  if (!target) {
    console.error("Usage : node scripts/set-admin.cjs <email|uid> [--remove] | --list");
    process.exit(1);
  }
  initializeApp();
  const auth = getAuth();
  if (target === "--list") {
    let pageToken;
    do {
      const page = await auth.listUsers(1000, pageToken);
      page.users.filter((u) => u.customClaims?.admin === true).forEach((u) => console.log(`${u.uid}\t${u.email ?? "(sans email)"}`));
      pageToken = page.pageToken;
    } while (pageToken);
    return;
  }
  const user = target.includes("@") ? await auth.getUserByEmail(target) : await auth.getUser(target);
  const claims = { ...(user.customClaims ?? {}) };
  if (flag === "--remove") delete claims.admin; else claims.admin = true;
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`${flag === "--remove" ? "Droits admin retirés" : "Droits admin accordés"} : ${user.uid} (${user.email ?? "sans email"})`);
  console.log("→ le compte doit se reconnecter pour que le changement s'applique.");
}

main().catch((error) => { console.error(error.message ?? error); process.exit(1); });
