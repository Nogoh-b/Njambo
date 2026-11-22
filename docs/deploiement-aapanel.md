# Déploiement sur le VPS aaPanel (back + front)

État réel de la production installée le 2026-11-22 sur `169.58.160.40` (aaPanel 8,
Ubuntu 24.04). Pour l'ancienne cible Vercel + VPS « nu », voir `docs/deploiement.md`.

```
navigateur ──► https://njambo.bisoft-solutions.com         Nginx → njambo_web    127.0.0.1:3020 (next start)
           └─► https://njambo-server.bisoft-solutions.com  Nginx → njambo_server 127.0.0.1:8081 (API + /ws)
                                                           Nginx → /uploads/ servi depuis /www/njambo-uploads
```

## Ce qui est en place

| Élément | Emplacement |
| --- | --- |
| Code (clone de `github.com/Nogoh-b/Njambo`, branche `master`) | `/www/wwwroot/njambo` |
| Projets aaPanel (Site web → Projet Node.js) | `njambo_server` (cwd `server/`), `njambo_web` (cwd racine), utilisateur `www`, démarrage au boot |
| Commandes de démarrage des projets | `/www/njambo-run/start-server.sh`, `/www/njambo-run/start-web.sh` |
| Config back | `/www/wwwroot/njambo/server/.env` (600, hors Git) |
| Config front (lue **au build**) | `/www/wwwroot/njambo/.env.production` (600, hors Git) |
| Secrets générés (mot de passe Postgres, `NJAMBO_GRID_SECRET`, `AUTH_JWT_SECRET`) + clé de service Firebase | `/www/njambo-secrets/` (700) |
| Uploads admin | `/www/njambo-uploads` |
| Base | PostgreSQL 16 (apt), base et rôle `njambo`, écoute en local seulement |
| Nginx en plus du proxy aaPanel (`/uploads/`, `client_max_body_size`) | aaPanel → projet `njambo_server` → Pseudo-statique (`vhost/rewrite/node_njambo_server.conf`) |
| SSL | Let's Encrypt via aaPanel, HTTP → HTTPS forcé, renouvellement par aaPanel |
| Logs | `/www/wwwlogs/nodejs/njambo_server.log`, `njambo_web.log` |

Les processus sont gérés par **aaPanel**, pas par PM2 : ne pas lancer
`scripts/deploy-back.sh` ni `pm2 start ecosystem.config.js` sur ce serveur (deux
process se disputeraient le port 8081 et les tâches planifiées tourneraient en double).

## Mettre à jour

Pousser d'abord le code sur `master`, puis lancer **`scripts/deploy-aapanel.sh`**, soit
depuis aaPanel (Git Manager, ci-dessous), soit en root sur le VPS :

```bash
bash /www/wwwroot/njambo/scripts/deploy-aapanel.sh          # ou : … deploy-aapanel.sh autre-branche
```

Le script :
1. remet le dossier exactement sur `origin/master` (`git reset --hard` : les `.env`, non suivis,
   restent ; l'installation automatique d'aaPanel supprime les `package-lock.json`, ils reviennent) ;
2. installe les dépendances et compile le back ;
3. compile le front dans `.next-build`, pendant que le site en ligne continue de tourner ;
4. redémarre `njambo_server` (attend `/healthz`), bascule `.next-build` → `.next` et redémarre
   `njambo_web`.

Si une étape échoue, il s'arrête **avant** de redémarrer : l'ancienne version reste en ligne.

Après une modification de `server/.env` : aaPanel → **Redémarrer** `njambo_server` seulement.
Après une modification de `.env.production` : relancer le script (les `NEXT_PUBLIC_*` sont figées au build).

### Depuis aaPanel (Git Manager)

Le dépôt est déjà cloné dans `/www/wwwroot/njambo` : dans aaPanel → Site web → Projet Node.js →
`njambo_web` → **Git Manager** → **Importer** (dépôt existant, branche `master`). Puis onglet
**Scénario**, script :

```bash
bash /www/wwwroot/njambo/scripts/deploy-aapanel.sh master
```

Le bouton de déploiement du Git Manager (ou son webhook GitHub) lance alors tout le déploiement,
back compris. Ne pas brancher le Git Manager aussi sur `njambo_server` : un seul script suffit.

## Reste à faire

Urgent (relevé au déploiement du 2026-11-22) :

- [ ] Firebase Console → Authentication → Settings → **Authorized domains** : ajouter
      `njambo.bisoft-solutions.com` (sinon la connexion échoue).
- [ ] `NEXT_PUBLIC_FIREBASE_VAPID_KEY` absente des `.env` locaux, donc de `.env.production`
      (Web Push inactif) : l'ajouter puis rebuild du front.
- [ ] Le dépôt GitHub est **public** et d'anciens secrets sont dans son historique :
      le passer en privé et renouveler la clé de service Firebase.

Ensuite :

- [ ] Droits admin : `cd /www/wwwroot/njambo/server && node scripts/set-admin.cjs ton@email.com`.
- [ ] Admin → Outils → « Migrer les cartes de pouvoir en base ».
- [ ] Sauvegardes : tâche Cron aaPanel `pg_dump` + archive de `/www/njambo-uploads`
      (modèle dans `docs/deploiement.md` § Sauvegardes ; mot de passe dans `/www/njambo-secrets/db_password`).
