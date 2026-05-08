import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DossierPiecesModal from "@/components/DossierPiecesModal";

describe("DossierPiecesModal", () => {
  const fetchMock = jest.fn();
  const digestMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock;
    global.crypto = {
      subtle: {
        digest: digestMock.mockResolvedValue(new Uint8Array(32).fill(1).buffer),
      },
    };
  });

  it("refuse un format non supporté", async () => {
    render(
      <DossierPiecesModal dossierId={1} dossierReference="DOS-2026-00001" onClose={jest.fn()} />,
    );
    const input = screen.getByLabelText("CNI");
    const file = new File(["text"], "cni.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/Format invalide/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse un fichier trop volumineux", async () => {
    render(
      <DossierPiecesModal dossierId={1} dossierReference="DOS-2026-00001" onClose={jest.fn()} />,
    );
    const input = screen.getByLabelText("CNI");
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "cni.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/Fichier trop volumineux/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("affiche les erreurs init, upload et validation", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({ detail: "Erreur init" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://minio.local/upload",
          s3_key: "dossiers/1/cni/cni.pdf",
          headers: { "Content-Type": "application/pdf", "x-amz-checksum-sha256": "abc" },
        }),
      })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://minio.local/upload",
          s3_key: "dossiers/1/cni/cni.pdf",
          headers: { "Content-Type": "application/pdf", "x-amz-checksum-sha256": "abc" },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ detail: "Erreur complete" }) });

    render(
      <DossierPiecesModal dossierId={1} dossierReference="DOS-2026-00001" onClose={jest.fn()} />,
    );
    const input = screen.getByLabelText("CNI");
    const file = new File(["ok"], "cni.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("Erreur init")).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("Upload MinIO échoué.")).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("Erreur complete")).toBeInTheDocument();
  });

  it("uploade une pièce avec succès et affiche le checkmark", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://minio.local/upload",
          s3_key: "dossiers/99/cni/cni.pdf",
          headers: {
            "Content-Type": "application/pdf",
            "x-amz-checksum-sha256": "check",
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: "ok" }) });

    render(
      <DossierPiecesModal dossierId={99} dossierReference="DOS-2026-00099" onClose={jest.fn()} />,
    );
    const input = screen.getByLabelText("CNI");
    const file = new File(["ok"], "cni.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("✓ Uploadé")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.example.com/api/v1/dossiers/99/pieces/upload-init",
      expect.any(Object),
    );
    delete process.env.NEXT_PUBLIC_API_URL;
  });
});
