import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DossierDetailPage from "@/app/mes-dossiers/[id]/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "13" }),
}));

describe("DossierDetailPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).crypto = {
      subtle: {
        digest: jest.fn().mockResolvedValue(new Uint8Array(32).fill(1).buffer),
      },
    };
  });

  it("affiche la checklist et les pièces manquantes avec soumission bloquée", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 12,
        reference: "DOS-2026-00012",
        type: "lld",
        status: "brouillon",
        checklist: [
          { type_piece: "cni", uploaded: true },
          { type_piece: "permis", uploaded: false },
          { type_piece: "revenus", uploaded: false },
          { type_piece: "domicile", uploaded: false },
          { type_piece: "rib", uploaded: false },
        ],
        missing_pieces: ["permis", "revenus", "domicile", "rib"],
        can_submit: false,
      }),
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /retour à mes dossiers/i })).toHaveAttribute("href", "/mes-dossiers");
      expect(screen.getByText(/soumission bloquée/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Permis de conduire/i).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /voir le récapitulatif/i })).toBeDisabled();
    });
  });

  it("permet d'uploader une pièce manquante depuis la fiche dossier", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 13,
          reference: "DOS-2026-00013",
          type: "lld",
          status: "brouillon",
          checklist: [
            { type_piece: "cni", uploaded: false },
            { type_piece: "permis", uploaded: false },
            { type_piece: "revenus", uploaded: false },
            { type_piece: "domicile", uploaded: false },
            { type_piece: "rib", uploaded: false },
          ],
          missing_pieces: ["cni", "permis", "revenus", "domicile", "rib"],
          can_submit: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://s3.example/upload",
          s3_key: "dossiers/13/cni/cni.pdf",
          headers: { "Content-Type": "application/pdf", "x-amz-checksum-sha256": "abc" },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "ok" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 13,
          reference: "DOS-2026-00013",
          type: "lld",
          status: "brouillon",
          checklist: [
            { type_piece: "cni", uploaded: true },
            { type_piece: "permis", uploaded: false },
            { type_piece: "revenus", uploaded: false },
            { type_piece: "domicile", uploaded: false },
            { type_piece: "rib", uploaded: false },
          ],
          missing_pieces: ["permis", "revenus", "domicile", "rib"],
          can_submit: false,
        }),
      } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Uploader CNI") as HTMLInputElement;
    const file = new File(["ok"], "cni.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "/api/v1/dossiers/13/pieces/upload-init",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        4,
        "/api/v1/dossiers/13/pieces/upload-complete",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
      expect(screen.getByText(/uploadée avec succès/i)).toBeInTheDocument();
    });
  });

  it("affiche le récapitulatif puis soumet avec succès", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 13,
          reference: "DOS-2026-00013",
          type: "achat",
          status: "brouillon",
          checklist: [
            { type_piece: "cni", uploaded: true },
            { type_piece: "permis", uploaded: true },
            { type_piece: "revenus", uploaded: true },
            { type_piece: "domicile", uploaded: true },
            { type_piece: "rib", uploaded: true },
          ],
          missing_pieces: [],
          can_submit: true,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 13,
          reference: "DOS-2026-00013",
          type: "achat",
          status: "depose",
          checklist: [
            { type_piece: "cni", uploaded: true },
            { type_piece: "permis", uploaded: true },
            { type_piece: "revenus", uploaded: true },
            { type_piece: "domicile", uploaded: true },
            { type_piece: "rib", uploaded: true },
          ],
          missing_pieces: [],
          can_submit: true,
        }),
      } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /voir le récapitulatif/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /voir le récapitulatif/i }));
    expect(screen.getByText(/récapitulatif avant confirmation/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirmer la soumission/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "/api/v1/dossiers/13/submit",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
      expect(screen.getByText(/dossier soumis avec succès/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur quand le chargement du dossier échoue", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Dossier introuvable" }),
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Dossier introuvable")).toBeInTheDocument();
    });
  });

  it("garde le récapitulatif ouvert et affiche l'erreur si la soumission échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 14,
          reference: "DOS-2026-00014",
          type: "lld",
          status: "brouillon",
          checklist: [
            { type_piece: "cni", uploaded: true },
            { type_piece: "permis", uploaded: true },
            { type_piece: "revenus", uploaded: true },
            { type_piece: "domicile", uploaded: true },
            { type_piece: "rib", uploaded: true },
          ],
          missing_pieces: [],
          can_submit: true,
          created_at: "invalid-date",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: "Soumission impossible." }),
      } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /voir le récapitulatif/i })).toBeEnabled();
      expect(screen.getByText("-")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /voir le récapitulatif/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmer la soumission/i }));

    await waitFor(() => {
      expect(screen.getByText("Soumission impossible.")).toBeInTheDocument();
      expect(screen.queryByText(/récapitulatif avant confirmation/i)).not.toBeInTheDocument();
    });
  });

  it("permet d'annuler le récapitulatif de soumission", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 15,
          reference: "DOS-2026-00015",
          type: "lld",
          status: "brouillon",
          checklist: [
            { type_piece: "cni", uploaded: true },
            { type_piece: "permis", uploaded: true },
            { type_piece: "revenus", uploaded: true },
            { type_piece: "domicile", uploaded: true },
            { type_piece: "rib", uploaded: true },
          ],
          missing_pieces: [],
          can_submit: true,
        }),
      } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /voir le récapitulatif/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /voir le récapitulatif/i }));
    fireEvent.click(screen.getByRole("button", { name: /annuler/i }));
    await waitFor(() => {
      expect(screen.queryByText(/récapitulatif avant confirmation/i)).not.toBeInTheDocument();
    });
  });

  it("bloque un upload avec un format de fichier invalide", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 16,
        reference: "DOS-2026-00016",
        type: "lld",
        status: "brouillon",
        checklist: [
          { type_piece: "cni", uploaded: false },
          { type_piece: "permis", uploaded: false },
          { type_piece: "revenus", uploaded: false },
          { type_piece: "domicile", uploaded: false },
          { type_piece: "rib", uploaded: false },
        ],
        missing_pieces: ["cni", "permis", "revenus", "domicile", "rib"],
        can_submit: false,
      }),
    } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument();
    });
    const input = screen.getByLabelText("Uploader CNI") as HTMLInputElement;
    const file = new File(["txt"], "bad.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/format invalide/i)).toBeInTheDocument();
    });
  });

  it("bloque un upload quand le fichier dépasse 10 Mo", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 19,
        reference: "DOS-2026-00019",
        type: "lld",
        status: "brouillon",
        checklist: [
          { type_piece: "cni", uploaded: false },
          { type_piece: "permis", uploaded: false },
          { type_piece: "revenus", uploaded: false },
          { type_piece: "domicile", uploaded: false },
          { type_piece: "rib", uploaded: false },
        ],
        missing_pieces: ["cni", "permis", "revenus", "domicile", "rib"],
        can_submit: false,
      }),
    } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument();
    });
    const input = screen.getByLabelText("Uploader CNI") as HTMLInputElement;
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [oversized] } });

    await waitFor(() => {
      expect(screen.getByText(/fichier trop volumineux/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur de pré-signature si upload-init échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 17,
          reference: "DOS-2026-00017",
          type: "lld",
          status: "brouillon",
          checklist: [
            { type_piece: "cni", uploaded: false },
            { type_piece: "permis", uploaded: false },
            { type_piece: "revenus", uploaded: false },
            { type_piece: "domicile", uploaded: false },
            { type_piece: "rib", uploaded: false },
          ],
          missing_pieces: ["cni", "permis", "revenus", "domicile", "rib"],
          can_submit: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Uploader CNI") as HTMLInputElement;
    const file = new File(["ok"], "cni.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/pré-signature impossible/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur si l'upload S3 échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 18,
          reference: "DOS-2026-00018",
          type: "lld",
          status: "brouillon",
          checklist: [
            { type_piece: "cni", uploaded: false },
            { type_piece: "permis", uploaded: false },
            { type_piece: "revenus", uploaded: false },
            { type_piece: "domicile", uploaded: false },
            { type_piece: "rib", uploaded: false },
          ],
          missing_pieces: ["cni", "permis", "revenus", "domicile", "rib"],
          can_submit: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://s3.example/upload",
          s3_key: "dossiers/18/cni/cni.pdf",
          headers: { "Content-Type": "application/pdf", "x-amz-checksum-sha256": "abc" },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Uploader CNI") as HTMLInputElement;
    const file = new File(["ok"], "cni.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/upload du document échoué/i)).toBeInTheDocument();
    });
  });

  it("affiche un fallback si la validation upload-complete échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 20,
          reference: "DOS-2026-00020",
          type: "lld",
          status: "brouillon",
          checklist: [
            { type_piece: "cni", uploaded: false },
            { type_piece: "permis", uploaded: false },
            { type_piece: "revenus", uploaded: false },
            { type_piece: "domicile", uploaded: false },
            { type_piece: "rib", uploaded: false },
          ],
          missing_pieces: ["cni", "permis", "revenus", "domicile", "rib"],
          can_submit: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://s3.example/upload",
          s3_key: "dossiers/20/cni/cni.pdf",
          headers: { "Content-Type": "application/pdf", "x-amz-checksum-sha256": "abc" },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument();
    });
    const input = screen.getByLabelText("Uploader CNI") as HTMLInputElement;
    const file = new File(["ok"], "cni.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/validation du document impossible/i)).toBeInTheDocument();
    });
  });
});
