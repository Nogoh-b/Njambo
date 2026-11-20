/* Attribue (ou retire) le droit admin à un compte (table auth_users, Postgres).
   Usage (depuis server/) :
     node scripts/set-admin.cjs <email|uid>            → donne les droits admin
     node scripts/set-admin.cjs <email|uid> --remove   → retire les droits
     node scripts/set-admin.cjs --list                 → liste les admins
   Connexion : DATABASE_URL (chargé depuis server/.env s'il existe).
   Le droit est inscrit dans le jeton d'accès : il s'applique au prochain
   renouvellement (≤ 30 min) ou immédiatement après reconnexion. */
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Client } = require("pg");

for (const file of [resolve(__dirname, "../.env"), resolve(process.cwd(), ".env")]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    break;
  } catch { /* fichier absent */ }
}

async function main() {
  const [target, flag] = process.argv.slice(2);
  if (!target) {
    console.error("Usage : node scripts/set-admin.cjs <email|uid> [--remove] | --list");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL absent (server/.env)");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (target === "--list") {
      const { rows } = await client.query("SELECT uid, email FROM auth_users WHERE admin ORDER BY email");
      if (rows.length === 0) console.log("(aucun admin)");
      rows.forEach((row) => console.log(`${row.uid}\t${row.email ?? "(sans email)"}`));
      return;
    }
    const column = target.includes("@") ? "email" : "uid";
    const value = column === "email" ? target.trim().toLowerCase() : target.trim();
    const { rows } = await client.query(
      `UPDATE auth_users SET admin = $2 WHERE ${column} = $1 RETURNING uid, email`,
      [value, flag !== "--remove"],
    );
    if (rows.length === 0) throw new Error(`Aucun compte trouvé pour ${target} (crée-le d'abord dans le jeu)`);
    console.log(`${flag === "--remove" ? "Droits admin retirés" : "Droits admin accordés"} : ${rows[0].uid} (${rows[0].email ?? "sans email"})`);
    console.log("→ reconnecte-toi (ou attends le renouvellement du jeton) pour que le changement s'applique.");
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error.message ?? error); process.exit(1); });
