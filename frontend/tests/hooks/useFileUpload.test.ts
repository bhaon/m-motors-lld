import { renderHook, act } from "@testing-library/react";
import { useFileUpload } from "@/hooks/useFileUpload";

function makeFetch(responses: Partial<Response>[]) {
  let i = 0;
  return jest.fn().mockImplementation(() => Promise.resolve(responses[i++] ?? { ok: true, json: async () => ({}) }));
}

beforeEach(() => { jest.restoreAllMocks(); });

describe("useFileUpload", () => {
  it("retourne uploadingType=null et error='' par défaut", () => {
    const { result } = renderHook(() => useFileUpload("1"));
    expect(result.current.uploadingType).toBeNull();
    expect(result.current.error).toBe("");
  });

  it("rejette un fichier avec un format non supporté", async () => {
    const { result } = renderHook(() => useFileUpload("1"));
    const file = new File(["x"], "doc.gif", { type: "image/gif" });
    await act(async () => {
      await result.current.uploadPiece("cni", file, jest.fn());
    });
    expect(result.current.error).toMatch(/format invalide/i);
  });

  it("rejette un fichier trop volumineux", async () => {
    const { result } = renderHook(() => useFileUpload("1"));
    const bigFile = new File([new ArrayBuffer(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(bigFile, "size", { value: 11 * 1024 * 1024 });
    await act(async () => {
      await result.current.uploadPiece("cni", bigFile, jest.fn());
    });
    expect(result.current.error).toMatch(/volumineux/i);
  });

  it("appelle onSuccess si le flux 3 étapes réussit", async () => {
    global.fetch = makeFetch([
      { ok: true, json: async () => ({ upload_url: "https://minio/put", s3_key: "k", headers: { "Content-Type": "application/pdf" } }) },
      { ok: true, json: async () => ({}) },
      { ok: true, json: async () => ({}) },
    ] as Response[]);

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useFileUpload("42"));
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.current.uploadPiece("permis", file, onSuccess);
    });

    expect(onSuccess).toHaveBeenCalledWith("permis");
    expect(result.current.error).toBe("");
  });

  it("attend la fin d'un onSuccess asynchrone avant de libérer uploadingType", async () => {
    global.fetch = makeFetch([
      { ok: true, json: async () => ({ upload_url: "https://minio/put", s3_key: "k", headers: { "Content-Type": "application/pdf" } }) },
      { ok: true, json: async () => ({}) },
      { ok: true, json: async () => ({}) },
    ] as Response[]);

    let ranAsyncBody = false;
    const onSuccess = jest.fn(async () => {
      await Promise.resolve();
      ranAsyncBody = true;
    });

    const { result } = renderHook(() => useFileUpload("42"));
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.current.uploadPiece("cni", file, onSuccess);
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(ranAsyncBody).toBe(true);
    expect(result.current.uploadingType).toBeNull();
  });

  it("expose une erreur si l'init échoue", async () => {
    global.fetch = makeFetch([
      { ok: false, json: async () => ({ detail: "Quota dépassé." }) },
    ] as Response[]);

    const { result } = renderHook(() => useFileUpload("99"));
    const file = new File(["x"], "cni.pdf", { type: "application/pdf" });

    await act(async () => {
      await result.current.uploadPiece("cni", file, jest.fn());
    });

    expect(result.current.error).toMatch(/quota/i);
  });
});
