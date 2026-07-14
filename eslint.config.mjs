import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Rendu fidèle d'un composant React existant : on conserve les patterns
      // d'origine (Math.random dans un initialiseur de ref, accès aux refs
      // dans des handlers/effets, early-returns par écran). Ces règles
      // strictes de React 19 n'existaient pas dans la source d'origine.
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "functions/lib/**",
    "server/dist/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
