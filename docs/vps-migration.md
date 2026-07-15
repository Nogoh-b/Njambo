# Migration VPS — architecture sans Cloud Functions ni Firestore

Date : 14 juillet 2026

## Vue d'ensemble

Le backend tourne désormais sur un VPS (dossier `server/`) et les données vivent
dans PostgreSQL. Firebase ne fournit plus que **Auth** (invité/téléphone/Google)
et **Cloud Messaging** (Web Push). Aucune facturation Blaze requise.

```
Client Next.js
  ├─ écritures  → POST https://api…/api/:command   (lib/backend.ts → server/src/routes.ts)
  ├─ lectures   → WebSocket wss://api…/ws          (lib/firestoreClient.ts → server/src/realtime)
  └─ auth       → Firebase Auth (ID token vérifié par le serveur)

server/ (VPS, Node)
  ├─ Express : 35 commandes (économie, matchs, rooms, social, admin)
  ├─ WebSocket : abonnements doc/query, autorisation portée de firestore.rules
  ├─ jobs : remboursements (listener + cron 5 min), énergie pleine (cron 15 min)
  └─ firestoreCompat : façade Postgres compatible API firebase-admin/firestore
        table documents(path, parent, data JSONB, updated_at)
```

## Couches et fichiers clés

| Couche | Fichiers | Rôle |
| --- | --- | --- |
| Contrat de persistance | `functions/src/firestoreTypes.ts`, `functions/src/core.ts` (`setDbBackend`) | Interface minimale ; les handlers ne savent pas quel backend tourne |
| Façade Postgres | `server/src/firestoreCompat/pg.ts`, `bus.ts` | Transactions (FOR UPDATE + retry), merge récursif, onSnapshot via bus post-commit |
| Commandes | `functions/src/*Commands.ts` + `server/src/routes.ts` | 19 commandes historiques + 16 nouvelles (rooms/social/présence/profil/réactions/brouillon admin) |
| Temps réel | `server/src/realtime/{server,authz,protocol}.ts` | subscribe/get doc+query ; `authz.ts` = portage des règles de lecture |
| Client | `lib/backend.ts`, `lib/realtime.ts`, `lib/firestoreClient.ts`, `lib/backendCallable.ts` | fetch + WS avec reconnexion ; shim API Firestore (les écrans n'ont pas changé) |
| Migration | `server/scripts/migrateFromFirestore.ts` | Copie Firestore → Postgres, Timestamps → millisecondes, relançable |

## Démarrage sur le VPS

```bash
# Prérequis : Node 20+, PostgreSQL 14+ (base + rôle dédiés)
cd server && npm install && npm run build
DATABASE_URL=postgres://njambo:…@localhost:5432/njambo \
GOOGLE_APPLICATION_CREDENTIALS=/opt/njambo/service-account.json \
PORT=8081 node dist/server/src/index.js
```

- Sans `DATABASE_URL`, le serveur retombe sur Firestore (utile en transition).
- Le schéma Postgres (table + index + fonction `jsonb_deep_merge`) est créé
  automatiquement au démarrage.
- Reverse proxy attendu devant : HTTPS + upgrade WebSocket sur `/ws`.
- Client : `NEXT_PUBLIC_BACKEND_URL=https://api.votre-domaine`.

## Migration des données (bascule finale)

```bash
cd server
GOOGLE_APPLICATION_CREDENTIALS=… DATABASE_URL=… npx tsx scripts/migrateFromFirestore.ts --dry-run
GOOGLE_APPLICATION_CREDENTIALS=… DATABASE_URL=… npx tsx scripts/migrateFromFirestore.ts
```

## Ce qui reste côté Firebase

- **Auth** : inchangé (`lib/firebase.ts` n'initialise plus que app + auth).
- **Messaging** : `registerPushToken` + `notifyFullEnergy` utilisent FCM via
  firebase-admin — indépendant de Firestore.
- `firestore.rules` et `functions/` restent dans le dépôt comme référence et
  repli : les handlers sont partagés, seul le backend de persistance change.

## Régressions assumées / points ouverts

1. Plus de cache offline IndexedDB (persistentLocalCache) : l'app requiert une
   connexion au boot. Un cache localStorage pourra être ajouté plus tard.
2. App Check retiré : ajouter un rate limiting (express-rate-limit) derrière le
   reverse proxy est recommandé avant l'ouverture publique.
3. Les tests de règles Firestore (`tests/firestore.rules.test.ts`) ne couvrent
   plus le chemin de production ; l'équivalent serveur est `server/src/realtime/authz.ts`
   (à couvrir par des tests unitaires).
4. Test de bout en bout Postgres à faire : émulateur Auth + Postgres local +
   `server` + client (voir plan de vérification).
