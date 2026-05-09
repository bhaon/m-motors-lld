/**
 * Calcule le condensé SHA-256 d’un fichier (hexadécimal minuscule, 64 caractères).
 */
export async function computeFileSha256Hex(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convertit une empreinte SHA-256 hexadécimale en Base64 (bytes bruts).
 */
export function sha256HexToBase64(hex: string): string {
  if (hex === "") return "";
  if (hex.length % 2 !== 0) {
    throw new Error("Empreinte SHA-256 hexadécimale invalide.");
  }
  const pairs = hex.match(/.{1,2}/g);
  if (!pairs) {
    throw new Error("Empreinte SHA-256 hexadécimale invalide.");
  }
  const bytes = new Uint8Array(pairs.map((byte) => parseInt(byte, 16)));
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}
