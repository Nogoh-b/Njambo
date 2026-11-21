"use client";

/* Rendu Markdown minimal et sûr des réponses de l'assistant : paragraphes,
   titres, listes, blocs de code, `code`, **gras**, _italique_ ou *italique*. Aucun HTML
   injecté : tout passe par des éléments React. */

import { Fragment, type ReactNode } from "react";

/* L'italique `_…_` ou `*…*` n'est reconnu qu'en dehors d'un mot : `list_animation_models` et 2*3*4 restent intacts. */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|(?<![\p{L}\p{N}_])_[^_\s][^_]*_(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}*])\*[^*\s][^*]*\*(?![\p{L}\p{N}*]))/gu;

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    const k = `${key}-${index}`;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={k} style={{ background: "#0c0906", border: "1px solid var(--line)", borderRadius: 5, padding: "0 4px", fontSize: "0.92em" }}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={k}>{inline(part.slice(2, -2), k)}</strong>;
    if (((part.startsWith("_") && part.endsWith("_")) || (part.startsWith("*") && part.endsWith("*"))) && part.length > 2) return <em key={k}>{part.slice(1, -1)}</em>;
    return <Fragment key={k}>{part}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const key = `b${index}`;
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith("```")) code.push(lines[index++]);
      index += 1;
      blocks.push(<pre key={key} style={{ background: "#0c0906", border: "1px solid var(--line)", borderRadius: 10, padding: 10, overflow: "auto", fontSize: 12, margin: "6px 0" }}>{code.join("\n")}</pre>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<div key={key} style={{ fontWeight: 800, fontSize: heading[1].length <= 2 ? 15 : 14, margin: "10px 0 4px", color: "var(--gold)" }}>{inline(heading[2], key)}</div>);
      index += 1;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: string[] = [];
      while (index < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={key} style={{ margin: "4px 0", paddingLeft: 20 }}>{items.map((item, i) => <li key={i}>{inline(item, `${key}-${i}`)}</li>)}</List>);
      continue;
    }
    if (!line.trim()) { index += 1; continue; }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,4}\s|```|\s*([-*•]|\d+[.)])\s+)/.test(lines[index])) paragraph.push(lines[index++]);
    blocks.push(<p key={key} style={{ margin: "4px 0" }}>{paragraph.flatMap((part, i) => (i ? [<br key={`br${i}`} />, ...inline(part, `${key}-${i}`)] : inline(part, `${key}-${i}`)))}</p>);
  }
  return <div style={{ lineHeight: 1.5 }}>{blocks}</div>;
}
