# Suivi — Assistant IA de la console admin

> Fichier de **suivi**, mis à jour à **chaque avancée** : case cochée,
> statut de l'étape et une ligne dans le journal en bas de page.
>
> Branche : `ccr-d50eb567-ocrmnv`

## État

| Étape | Contenu | Statut |
| --- | --- | --- |
| A1 | Fournisseurs : DeepSeek, Claude, OpenAI, Gemini, compatible OpenAI, simulation | ✅ Terminé |
| A2 | Outils : lecture, validation, brouillons, propositions (animations, cartes de pouvoir) | ✅ Terminé |
| A3 | Section « Assistant IA » de la console (conversations, réglages, propositions) | ✅ Terminé |
| A4 | Clés des fournisseurs et essai réel | 🟡 4 IA fonctionnent ; Gemini et Meta bloqués par leur facturation |
| A4b | Assistant dans les pages Animations et Cartes de pouvoir (panneau sur l'élément ouvert) | ✅ Terminé |
| A5 | Autres modules de la console (événements, cosmétiques, joueurs…) | ⬜ Plus tard |

Légende : ⬜ à faire · 🟡 en cours · ✅ terminé · ⛔ bloqué

## Décisions (2026-11-21)

| Sujet | Décision |
| --- | --- |
| Premiers modules | **Animations** (modèles, moments, styles) et **cartes de pouvoir** |
| Fournisseurs | **DeepSeek** par défaut, plus **Claude**, **OpenAI**, **Gemini** et un service **compatible OpenAI** libre (Mistral, OpenRouter, Groq, Ollama…) |
| Réglages | Choix de l'IA, du **modèle**, de la **réflexion** (niveau) et de la **température**, là où le fournisseur les accepte |
| Pouvoirs de l'assistant | **Brouillons seulement** ; publier ou attribuer un moment : il le **propose**, l'admin confirme d'un clic |
| Historique | **Gardé en base, par admin** (`ai_conversations`), jamais lisible depuis le client |
| Clés | **Côté serveur uniquement** (`server/.env`, modèle : `server/.env.example`) |

## A1 — Fournisseurs ✅

- [x] Format neutre des conversations (`server/src/ai/types.ts`), historique
      en **ajout seul** : ce qui est renvoyé au modèle ne change jamais.
- [x] Adaptateur **compatible OpenAI** (`openaiCompat.ts`, `fetch`) pour
      DeepSeek, OpenAI, Gemini et le service libre :
  - DeepSeek : `thinking` + `reasoning_effort` (low / high / max) ; avec
    des outils, chaque `reasoning_content` est renvoyé (sinon erreur 400) ;
    température seulement réflexion coupée ;
  - OpenAI : `reasoning_effort` (none à xhigh), température seulement à
    « none » ;
  - Gemini : point d'accès compatible OpenAI, signatures de réflexion
    (`extra_content`) renvoyées telles quelles ;
  - réponse brute renvoyée au même fournisseur, limitée aux champs
    acceptés en entrée.
- [x] Adaptateur **Claude** (`claude.ts`, SDK officiel `@anthropic-ai/sdk`) :
      réflexion adaptative avec résumé lisible, profondeur par l'effort
      (low à max ; la réflexion ne se coupe pas sur Opus 5.5), **aucune
      température** (refusée par l'API depuis le 2026-10-21), cache du
      système et des outils, **repli serveur en cas de refus**
      (`fallbacks: "default"`) sur les modèles qui l'acceptent, règle de
      renvoi des tours repliés.
- [x] Fournisseur **Simulation** (`simulation.ts`), hors production : réponses
      scriptées, sans clé, pour éprouver toute la chaîne.
- [x] Registre (`providers.ts`) : clés lues dans `server/.env`, fournisseur
      sans clé affiché mais désactivé, **modèles lus en direct** chez le
      fournisseur (cache 10 min) avec liste de repli, modèle par défaut
      réglable (`AI_<…>_MODEL`).

## A2 — Outils ✅

- [x] Référence tirée du **code source** (types et bornes des modèles, des
      moments, des styles, des cartes, des chorégraphies) + règles du jeu
      calculées depuis `GAME_CONFIG` + guide de la console (`reference.ts`).
- [x] Lecture : bibliothèque et fiche d'un modèle, moments du jeu (contraintes,
      plafonds, modèles compatibles), catalogue et fiche d'une carte.
- [x] Validation à blanc d'un modèle ou d'une carte.
- [x] Brouillons (modèle, carte) : mêmes commandes que l'admin, **au nom de
      l'admin connecté**, plus une trace `assistant_tool_write` dans l'audit.
- [x] Propositions : publier un modèle, publier une carte, attribuer les
      moments. Vérifiées avant d'être proposées (erreurs, conflits avec un
      moment) ; exécutées **seulement** quand l'admin confirme.
- [x] Outils filtrés par module ; arguments illisibles ou erreur serveur
      renvoyés au modèle pour qu'il corrige.

## A3 — Section « Assistant IA » ✅

- [x] Commandes : configuration, liste, lecture, envoi, suite, confirmation,
      suppression. **Une requête = un appel au modèle** : le navigateur
      enchaîne les étapes d'outils (12 au plus par message), ce qui évite les
      délais dépassés et montre la progression.
- [x] Le message de l'admin est gardé si le fournisseur échoue : bouton
      **Relancer** (éventuellement avec une autre IA).
- [x] Écran : conversations (par module : Animations, Cartes de pouvoir, ou
      les deux), réglages (IA, modèle, réflexion, température, grisés là où
      ils n'ont pas d'effet, avec la raison), réflexion repliable, appels
      d'outils et leurs résultats, lien vers la section d'un brouillon,
      cartes de proposition **Confirmer / Écarter**, bouton **Arrêter**,
      consommation de jetons.
- [x] Entrée dans le journal des nouveautés de la console.
- [x] Vérification dans le navigateur intégré, compte admin connecté par
      l'utilisateur, fournisseur de simulation :
  - la section s'ouvre ; les 5 fournisseurs sans clé sont grisés
    (« non configuré ») avec l'avertissement, « Simulation » est choisi ;
    température grisée quand le fournisseur ne l'accepte pas ;
  - conversation en lecture seule : bulle, appel d'outil « ✓ Bibliothèque
    des modèles — 22 modèles », détail JSON dépliable, réponse finale,
    conversation ajoutée à la liste ;
  - scénario d'écriture enchaîné tout seul : lecture, brouillon
    « simulation_essai » (lien vers l'atelier qui fonctionne), carte de
    proposition Confirmer / Écarter ; **Écarter** : carte « Écartée », note
    ajoutée, rien de publié ;
  - nettoyage : brouillon abandonné depuis l'atelier, conversations
    supprimées depuis l'écran.
- [x] **Corrigé pendant la vérification** :
  - rendu Markdown : `list_animation_models` s'affichait
    « listanimationmodels » (les `_…_` étaient lus comme de l'italique).
    L'italique n'est plus reconnu à l'intérieur d'un mot ; test
    `tests/assistant-markdown.test.tsx` (3 tests) ;
  - mise en page : les deux colonnes se replient quand la place manque ;
    exemples de questions en cartes (plus en pastilles ovales) ;
  - détail d'un outil : contenu tronqué à 12 000 caractères (au lieu de
    4 000, qui cassait le JSON) et retour à la ligne ;
  - libellé « non configuré » au lieu de « clé manquante » (le service
    compatible OpenAI manque d'une adresse, pas d'une clé) ;
  - compteur de jetons masqué quand il vaut zéro.
- [ ] Vu en passant, hors assistant : quand le backend redémarre,
      `setPlayerPresence` lève une promesse non rattrapée (« 1 Issue » de
      Next en dev).

## A4 — Clés et essai réel 🟡

- [x] Clés ajoutées dans `server/.env` (ignoré par Git) : DeepSeek, Gemini
      (et `GOOGLE_API_KEY` en secours), GLM, MiMo, Meta, FreeLLM. Pas de clé
      Anthropic ni OpenAI pour l'instant.
- [x] Quatre fournisseurs ajoutés (au format compatible OpenAI) :
  - **GLM (Z.ai)** : `api.z.ai/api/paas/v4`. GLM 5 réfléchit toujours
    (« coupée » est refusée) ; la profondeur passe par `reasoning_effort`
    (faible / élevée / maximale) ;
  - **MiMo (Xiaomi)** : `api.xiaomimimo.com/v1`. Réflexion par
    `thinking: {type}` ; comme DeepSeek, le raisonnement est renvoyé sur
    chaque message (exigé réflexion active) ; température seulement
    réflexion coupée ;
  - **Meta** (Meta Model API, Muse Spark) et **FreeLLM** (service BiSoft) :
    compatibles génériques.
- [x] Choix du modèle par défaut corrigé : le modèle de reconnaissance vocale
      de MiMo (`mimo-v2.5-asr`) est écarté ; les plus récents sont choisis
      (`glm-5.3`, `mimo-v2.6-pro`, `muse-spark-1.3`).
- [x] Essais réels, échange en deux tours avec outil (appel, puis réponse
      avec le résultat, raisonnement renvoyé) :

  | IA | Résultat |
  | --- | --- |
  | DeepSeek (`deepseek-v4-pro`, réflexion élevée) | ✅ |
  | GLM (`glm-5.3`) | ✅ |
  | MiMo (`mimo-v2.6-pro` et `-flash`) | ✅ |
  | FreeLLM (`auto`, 320 modèles) | ✅ |
  | Gemini | ⛔ 402 : crédits prépayés épuisés (projet AI Studio, les deux clés) |
  | Meta | ⛔ 402 : vérification de facturation de l'équipe Meta |

- [x] Essai de bout en bout par l'admin dans la console avec DeepSeek :
      lecture des références et des moments, réponses détaillées, changement
      de modèle (`deepseek-v4-pro` → `deepseek-flash`) en cours de
      conversation sans erreur.
- [ ] Régler la facturation de Gemini (AI Studio) et de Meta, puis réessayer.
- [ ] Production : `proxy_read_timeout 300s` sur le bloc `location /` de
      Nginx (voir `docs/deploiement.md`), et les clés dans le `server/.env`
      du VPS.

## A4b — Assistant dans les pages ✅

Demande de l'admin : l'assistant doit être évident, intégré aux pages liste
et détail d'une animation ou d'une carte, avec leur contexte.

- [x] Panneau « ✦ Assistant IA » à droite des pages Animations et Cartes de
      pouvoir (`components/admin/assistant/AssistantDrawer.tsx`) :
  - **Animations** : bouton dans l'en-tête et « ✦ Demander à l'assistant »
    sur le modèle ouvert ; le panneau suit le modèle choisi dans la
    bibliothèque ;
  - **Cartes de pouvoir** : bouton dans l'en-tête (tout le catalogue), bouton
    ✦ sur chaque carte de la liste, et « ✦ Demander à l'assistant » dans
    l'éditeur ;
  - ouvert ou fermé, il le reste d'une page à l'autre ; il laisse sa place à
    la page sur grand écran (cartes dès 1280 px, atelier dès 1650 px), sinon
    il passe par-dessus.
- [x] Contexte : la conversation garde sa page d'origine (`context` :
      modèle, carte, bibliothèque, catalogue). Le prompt système dit à l'IA
      que « ce modèle » / « cette carte » désigne l'élément ouvert. Le
      panneau reprend la dernière conversation sur cet élément.
- [x] Questions toutes prêtes par page (explique-le, où sert-il en jeu,
      vérifie-le, une variante ; pour une carte : interactions, équilibrage…),
      envoyées d'un clic.
- [x] Modifications non enregistrées : jointes au message comme « copie de
      travail » (lue par l'IA, affichée 📎 dans le fil, 40 000 caractères au
      plus), jamais enregistrées ailleurs.
- [x] Quand l'assistant écrit le brouillon de l'élément ouvert (ou qu'une
      publication est confirmée), la page le recharge ; si l'admin a des
      modifications en cours, un bandeau propose « Charger sa version » ou
      « Garder la mienne ». « Voir le modèle / la carte » ouvre un brouillon
      créé par l'assistant en gardant la conversation.
- [x] Nouvel outil `find_animation_usage` : moments du jeu et pistes de
      chorégraphie des cartes (publiées et brouillons) qui reprennent un
      modèle.
- [x] « ⤢ » ouvre la conversation du panneau dans la section « Assistant IA »,
      dont l'historique affiche la page d'origine.
- [x] Rendu : italique `*…*` et code dans le gras.
- [x] Réglage « Explications techniques » (case à cocher, toujours visible,
      gardée dans le navigateur ; **coupé par défaut**). Coupé : l'IA parle à
      un admin qui ne connaît pas le code (noms affichés, secondes, ce que
      voient les joueurs, choix proposés avant de modifier, « avant /
      après », erreurs corrigées sans jargon) et la console masque la
      réflexion, les données des outils, les identifiants et la
      consommation. Activé : identifiants, champs, JSON. Vérifié avec
      DeepSeek sur « Piocher ».
- [x] Vérifié dans le navigateur : DeepSeek sur `draw` (« Où sert-il en
      jeu ? » → lecture + usages) et sur `vent_nord` (« Explique-la ») ;
      simulation pour le brouillon (bibliothèque rechargée, bandeau avec
      modifications en cours, « Charger sa version »), carte de la liste →
      éditeur sur la même conversation, « ⤢ ».

## Vérifications

- [x] `tests/ai-assistant.test.ts` (18 tests) : réflexion et température par
      fournisseur, outils au format fonction, renvoi du raisonnement
      DeepSeek et des signatures Gemini, lecture des réponses (arguments
      illisibles compris), erreurs HTTP, requête Claude (réflexion
      adaptative, pas de température, cache, repli serveur), règle des tours
      repliés, refus sans outil exécuté, registre (clés, modèles, modèle par
      défaut), scénario de simulation.
- [x] Intégration Postgres `smoke-ai-assistant.cjs` : **47/47**, dans un
      schéma temporaire supprimé ensuite (accès admin, conversation en
      lecture, brouillon + proposition + confirmation, historique par admin,
      relance après erreur, chaque outil, cartes et moments ; depuis A4b :
      page d'origine, copie de travail, usages d'un modèle).
- [x] `tsc` front et serveur, `eslint` des fichiers touchés, suite
      complète : 250 tests passés, 11 ignorés (règles Firestore).
- [x] Le backend de `npm run dev` connaît les commandes (« authentification
      requise » sans compte).

---

## Journal

| Date | Étape | Avancée |
| --- | --- | --- |
| 2026-11-21 | A4b | Réglage « Explications techniques » (coupé par défaut : langage simple pour un admin non développeur, détails techniques masqués). 25 tests unitaires de l'assistant, intégration 48/48. A4b commité avant (`134c882`). |
| 2026-11-21 | A4b | **Assistant dans les pages.** Panneau ✦ sur les pages Animations et Cartes de pouvoir (liste, carte, modèle ou carte en cours d'édition), contexte gardé par conversation, questions toutes prêtes, modifications non enregistrées jointes, rechargement après un brouillon de l'assistant, outil `find_animation_usage`. Vérifié avec DeepSeek et la simulation. 250 tests, intégration 47/47. |
| 2026-11-21 | A4 | Clés ajoutées ; GLM, MiMo, Meta et FreeLLM branchés. Essais réels en deux tours avec outil : DeepSeek, GLM, MiMo et FreeLLM fonctionnent ; Gemini et Meta refusés pour facturation (402). Essai de bout en bout par l'admin avec DeepSeek réussi. 245 tests, intégration 40/40. |
| 2026-11-21 | A3 | **A3 terminé.** Écran vérifié avec le compte admin et la simulation : lecture, brouillon, proposition écartée, nettoyage. Corrigés : identifiants mangés par l'italique, colonnes qui ne se repliaient pas, détail d'outil tronqué, libellés. 244 tests au vert. |
| 2026-11-21 | A1–A3 | Assistant IA codé : 5 fournisseurs + simulation, outils sur les animations et les cartes de pouvoir (lecture, validation, brouillons, propositions), section « Assistant IA » de la console, historique par admin. 18 tests unitaires, intégration Postgres 40/40, 241 tests au vert. Reste : vérification visuelle (compte admin), clés des fournisseurs, délai Nginx en production. |
| 2026-11-21 | — | Décisions : DeepSeek + Claude, OpenAI, Gemini, compatible OpenAI ; brouillons seulement avec validation de l'admin ; historique en base par admin. |
