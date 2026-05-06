/**
 * @jest-environment node
 */
import { renderToString } from "react-dom/server";
import RootLayout, { metadata } from "@/app/layout";

describe("RootLayout", () => {
  it("expose des métadonnées SEO", () => {
    expect(metadata.title).toContain("M-Motors");
    expect(metadata.description).toMatch(/Achat|location|dématérialisé/i);
  });

  it("produit une arborescence html lang=fr avec les enfants", () => {
    const html = renderToString(
      <RootLayout>
        <p>contenu-enfant</p>
      </RootLayout>,
    );
    expect(html).toMatch(/lang="fr"/);
    expect(html).toContain("contenu-enfant");
  });
});
