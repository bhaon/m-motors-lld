import { computeFileSha256Hex, sha256HexToBase64 } from "@/lib/sha256";

describe("sha256HexToBase64", () => {
  it("convertit un hash hexadécimal connu en base64 correct", () => {
    // SHA-256 de la chaîne vide en hex
    const emptyHex =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const result = sha256HexToBase64(emptyHex);
    // Valeur attendue : SHA-256 de "" en base64 standard
    expect(result).toBe("47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });

  it("retourne une chaîne vide pour un hex vide", () => {
    expect(sha256HexToBase64("")).toBe("");
  });

  it("rejette une empreinte hex de longueur impaire", () => {
    expect(() => sha256HexToBase64("a")).toThrow(/invalide/);
  });
});

describe("computeFileSha256Hex", () => {
  it("calcule le hash SHA-256 d'un fichier vide", async () => {
    const emptyFile = new File([], "empty.txt", { type: "text/plain" });
    const hex = await computeFileSha256Hex(emptyFile);
    expect(hex).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("produit un hash différent pour deux contenus distincts", async () => {
    const file1 = new File(["hello"], "f1.txt", { type: "text/plain" });
    const file2 = new File(["world"], "f2.txt", { type: "text/plain" });
    const [h1, h2] = await Promise.all([
      computeFileSha256Hex(file1),
      computeFileSha256Hex(file2),
    ]);
    expect(h1).not.toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h2).toHaveLength(64);
  });
});
