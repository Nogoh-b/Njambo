import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../components/admin/assistant/Markdown";

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("rendu Markdown de l'assistant", () => {
  it("laisse intacts les identifiants à soulignés", () => {
    const out = html("Outils : list_animation_models, play_classic et trick_end_settle.");
    expect(out).toContain("list_animation_models, play_classic et trick_end_settle.");
    expect(out).not.toContain("<em>");
  });

  it("reconnaît l'italique, le gras et le code", () => {
    const out = html("un _mot_ en italique, du **gras** et `play_classic`");
    expect(out).toContain("<em>mot</em>");
    expect(out).toContain("<strong>gras</strong>");
    expect(out).toMatch(/<code[^>]*>play_classic<\/code>/);
  });

  it("rend listes, titres et blocs de code sans HTML injecté", () => {
    const out = html("## Titre\n- un\n- deux\n\n```\n<script>x</script>\n```");
    expect(out).toContain("<li>un</li>");
    expect(out).toContain("Titre");
    expect(out).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(out).not.toContain("<script>");
  });
});
