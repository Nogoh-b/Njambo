# Greffe du Game Experience Engine (GXE)

Le moteur d'expérience vit dans un dépôt séparé : `C:\Data\Projet\BySoft\gxe`.
Njambo le consomme en **source**, sans build ni publication npm.

## Ce qui a été ajouté

| Fichier | Rôle |
|---|---|
| `components/GxeRoot.tsx` | monte `<GxeProvider delegate={{ autoDiscover: true }}>` + `<FxLayer zIndex={60}>` |
| `app/layout.tsx` | enveloppe `children` dans `<GxeRoot>` |
| `next.config.ts` | `transpilePackages` + `turbopack.root` |
| `app/globals.css` | section « Game Experience Engine » en fin de fichier |
| `components/play/PlayModeCard.module.css` | le CTA des tuiles consomme `--gxe-press` / `--gxe-hover` |
| `components/result/SettlementArena.tsx` | confettis au moment où le pot arrive chez le vainqueur |
| `node_modules/@gxe/*` | jonctions vers `../gxe/packages/*` (voir ci-dessous) |

**Aucun composant n'a été modifié pour les interactions.** La délégation
`autoDiscover` équipe les contrôles natifs (`button`, `[role=tab]`,
`[role=switch]`…) : `Btn`, `TabBar`, `ModeCard` et le CTA des tuiles de mode
publient dès lors `--gxe-press` / `--gxe-hover` / `--gxe-focus`. Seules les
**feuilles de style** ont été enrichies — c'est le contrat : le moteur publie,
le CSS décide.

Une seule exception assumée, `SettlementArena` : une célébration est un fait
de jeu, pas une interaction. Le moteur ne peut pas deviner qu'une manche vient
d'être gagnée — c'est à l'app de traduire ce fait en intention d'expérience.

## Effets (particules)

`<FxLayer>` monte un canvas plein écran hors du flux (`pointer-events: none`) ;
il ne coûte rien tant qu'aucun effet n'est tiré. `useFx()` est alors disponible
partout sous le provider :

```tsx
const fx = useFx();
fx.burst("confetti", elementDuVainqueur);  // ancré sur l'élément réel
const stop = fx.ambient("rain");           // ambiance, à stopper
```

Le réglage `motion.allowParticles` de l'app **fait foi** : le moteur ne décide
jamais à la place des préférences utilisateur.

## Réinstaller les liens

Les jonctions vivent dans `node_modules` : un `npm install` les efface.

```powershell
$src = "C:\Data\Projet\BySoft\gxe\packages"
$dst = "C:\Data\Projet\BySoft\Njambo\node_modules\@gxe"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
foreach ($p in @("contract","kernel","experience","stage","driver-motion","driver-particles","react")) {
  $link = Join-Path $dst $p
  if (Test-Path $link) { Remove-Item $link -Force -Recurse }
  New-Item -ItemType Junction -Path $link -Target (Join-Path $src $p) | Out-Null
}
```

`turbopack.root` doit pointer sur le dossier **parent** : Turbopack résout les
jonctions en chemins réels, et refuserait un module « hors projet » (`Module
not found: Can't resolve '@gxe/react'` — vérifié en le retirant).

> **Piège coûteux.** Changer `turbopack.root` change tous les identifiants de
> module (`[project]/Njambo/…`) et **invalide le cache Turbopack**. Un cache
> périmé produit alors des erreurs trompeuses qui n'ont rien à voir avec la
> greffe :
> `Could not find the module "…/global-error.js#default" in the React Client Manifest`.
> **Remède** : arrêter le serveur, `rm -rf .next`, redémarrer. Ne jamais purger
> `.next` pendant que le serveur tourne (cascade de `middleware-manifest.json`
> introuvable).

## La règle CSS à respecter

Le moteur n'écrit **jamais** `transform` : il publie des variables continues.
Le CSS décide seul, et il ne doit y avoir **qu'un seul écrivain** par
propriété — sinon la spécificité tranche à notre place (le piège qui a déjà
coûté deux bugs sur le thème solaire).

D'où le motif employé pour `.njb` :

```css
/* repli quand le moteur est absent (SSR, JS coupé, moteur désactivé) */
html:not([data-gxe-active]) .njb:hover:not(:disabled) { transform: translateY(-1px); }

/* le moteur pilote, en continu */
html[data-gxe-active] .njb {
  transform: translateY(calc(-1px * var(--gxe-hover, 0) + 2px * var(--gxe-press, 0)))
             scale(calc(1 - 0.025 * var(--gxe-press, 0)));
}
```

### ⚠️ Aucune propriété pilotée par `--gxe-*` ne va dans `transition`

Deux raisons, la seconde décisive :

1. deux lissages superposés (transition CSS + ressort du moteur) rendent le
   toucher mou ;
2. **surtout** : changer une variable CSS *non enregistrée* ne déclenche pas
   la transition d'une propriété qui en dépend — la valeur reste **figée à
   l'ancienne, indéfiniment**. Attendre ne sert à rien : la transition ne
   démarre jamais.

C'est ce qui a fait croire que la respiration ne fonctionnait pas : `filter`
et `box-shadow` étaient dans la liste `transition`, `transform` non — et seul
`transform` bougeait, dans la même règle.

Symptôme à reconnaître : une propriété reste bloquée à sa valeur de départ
alors que `getComputedStyle(el).getPropertyValue("--ma-variable")` montre la
bonne valeur. Remède : sortir la propriété de `transition` et laisser le
ressort du moteur faire le lissage.

## L'animation d'attente (respiration au repos)

Activée dans `GxeRoot` via `delegate={{ idle: { periodMs: 3800 } }}` : les
contrôles publient `--gxe-idle` (0→1→0) **sans aucune interaction**.

La règle d'or : **l'attente doit céder à l'intention**. Un bouton qui respire
pendant qu'on l'appuie donne un toucher mou. D'où le facteur d'amortissement,
qui annule la respiration dès qu'on survole ou qu'on appuie :

```css
--nj-breath: calc(
  var(--gxe-idle, 0) * (1 - var(--gxe-hover, 0)) * (1 - var(--gxe-press, 0))
);
```

Amplitudes retenues, volontairement minuscules : `scale` +0.6 %, `translateY`
−0,8 px, et un halo qui enfle sur les seuls `.njb--solid`. Une interface où
*tout* respire fort ne respire plus : elle grouille.

Coût : contrairement au reste du moteur, une attente maintient la boucle
éveillée. Elle est donc bornée aux éléments **visibles**, coupée par
`prefers-reduced-motion`, et suspendue quand l'onglet passe en arrière-plan.

## Exclure un élément

```html
<button data-gxe="off">…</button>
```

## Vérification

Le pane navigateur de la machine de dev n'exécute pas `requestAnimationFrame` :
aucune animation n'y est observable. Vérifier plutôt en posant les variables à
la main dans la console :

```js
const el = document.querySelector(".njb");
el.style.setProperty("--gxe-press", "1");
getComputedStyle(el).transform; // matrix(0.975, 0, 0, 0.975, 0, 2)
```

Pour voir le moteur animer réellement : ouvrir `http://localhost:3000` dans un
vrai navigateur.
