import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DossierDetailPage from "@/app/mes-dossiers/[id]/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "13" }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

// Payload de base : dossier brouillon sans pièces
const BASE_DOSSIER = {
  id: 13,
  reference: "DOS-2026-00013",
  type: "lld",
  status: "brouillon",
  created_at: "2026-05-07T10:15:00Z",
  submitted_at: null,
  motif_rejet: null,
  vehicle: { make: "Renault", model: "Clio", year: 2024 },
  historique: [],
  checklist: [
    { type_piece: "cni",     uploaded: false, filename: null },
    { type_piece: "permis",  uploaded: false, filename: null },
    { type_piece: "revenus", uploaded: false, filename: null },
    { type_piece: "domicile",uploaded: false, filename: null },
    { type_piece: "rib",     uploaded: false, filename: null },
  ],
  missing_pieces: ["cni", "permis", "revenus", "domicile", "rib"],
  can_submit: false,
  lld_pricing: {
    base_mensualite_ht: 199,
    options_supplement_ht: 0,
    total_mensualite_ht: 199,
    editable: true,
    edit_context: "brouillon" as const,
    items: [
      { code: "assurance", label: "Assurance tous risques", description: "Couv.", surcout_mensuel_ht: 39, selected: false },
      { code: "assistance", label: "Assistance & dépannage", description: "Aide.", surcout_mensuel_ht: 9, selected: false },
      { code: "entretien", label: "Entretien & révisions", description: "Rév.", surcout_mensuel_ht: 29, selected: false },
      { code: "controle_technique", label: "Contrôle technique", description: "CT.", surcout_mensuel_ht: 5, selected: false },
    ],
  },
};

// Payload complet : toutes pièces uploadées
const DOSSIER_COMPLET = {
  ...BASE_DOSSIER,
  checklist: [
    { type_piece: "cni",     uploaded: true, filename: "cni.pdf" },
    { type_piece: "permis",  uploaded: true, filename: "permis.pdf" },
    { type_piece: "revenus", uploaded: true, filename: "revenus.pdf" },
    { type_piece: "domicile",uploaded: true, filename: "domicile.pdf" },
    { type_piece: "rib",     uploaded: true, filename: "rib.pdf" },
  ],
  missing_pieces: [],
  can_submit: true,
};

/** Dossier avec contrat généré (US-06-07). */
const DOSSIER_EN_SIGNATURE = {
  ...BASE_DOSSIER,
  status: "en_signature",
  contrat: {
    reference: "CTR-2026-00013",
    signed_at: null as string | null,
    can_sign: true,
  },
};

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

  // ── Informations véhicule ────────────────────────────────────────────────

  it("affiche les informations du véhicule (marque, modèle, année)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/renault clio/i)).toBeInTheDocument();
      expect(screen.getByText("(2024)")).toBeInTheDocument();
    });
  });

  it("affiche le type de contrat (LLD)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/type.*:/i)).toBeInTheDocument();
      expect(screen.getByText("LLD")).toBeInTheDocument();
    });
  });

  it("affiche les options LLD et le total mensuel (US-07-01)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Options de votre abonnement LLD/i)).toBeInTheDocument();
      expect(screen.getByText(/Total mensuel HT/i)).toBeInTheDocument();
      expect(screen.getByText(/Assurance tous risques/i)).toBeInTheDocument();
    });
  });

  it("affiche le badge de statut lisible via StatusBadge", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Brouillon")).toBeInTheDocument();
    });
  });

  // ── Motif de rejet ───────────────────────────────────────────────────────

  it("affiche le motif de rejet quand le dossier est rejeté", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...BASE_DOSSIER,
        status: "rejete",
        motif_rejet: "Revenus insuffisants pour le financement demandé.",
      }),
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("note", { name: /motif de rejet/i })).toBeInTheDocument();
      expect(screen.getByText("Revenus insuffisants pour le financement demandé.")).toBeInTheDocument();
    });
  });

  it("n'affiche pas la zone motif de rejet si le dossier n'est pas rejeté", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.queryByRole("note", { name: /motif de rejet/i })).not.toBeInTheDocument();
    });
  });

  // ── Téléchargement ───────────────────────────────────────────────────────

  it("affiche un bouton Télécharger pour chaque pièce uploadée", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => DOSSIER_COMPLET,
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      const downloadButtons = screen.getAllByRole("button", { name: /télécharger/i });
      expect(downloadButtons).toHaveLength(5);
    });
  });

  it("n'affiche pas de bouton Télécharger pour une pièce non uploadée", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /télécharger/i })).not.toBeInTheDocument();
    });
  });

  it("appelle l'endpoint download-url et ouvre l'URL dans un nouvel onglet", async () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...BASE_DOSSIER,
          checklist: [
            { type_piece: "cni", uploaded: true, filename: "cni.pdf" },
            { type_piece: "permis",   uploaded: false, filename: null },
            { type_piece: "revenus",  uploaded: false, filename: null },
            { type_piece: "domicile", uploaded: false, filename: null },
            { type_piece: "rib",      uploaded: false, filename: null },
          ],
          missing_pieces: ["permis", "revenus", "domicile", "rib"],
          can_submit: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ download_url: "https://s3.example/cni.pdf", filename: "cni.pdf" }),
      } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /télécharger cni/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /télécharger cni/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "https://s3.example/cni.pdf",
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  it("affiche une erreur si le téléchargement échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...BASE_DOSSIER,
          checklist: [
            { type_piece: "cni", uploaded: true, filename: "cni.pdf" },
            { type_piece: "permis",   uploaded: false, filename: null },
            { type_piece: "revenus",  uploaded: false, filename: null },
            { type_piece: "domicile", uploaded: false, filename: null },
            { type_piece: "rib",      uploaded: false, filename: null },
          ],
          missing_pieces: ["permis", "revenus", "domicile", "rib"],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: "Document non trouvé." }),
      } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /télécharger cni/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /télécharger cni/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Document non trouvé.");
    });
  });

  it("affiche le nom du fichier sous le libellé de la pièce uploadée", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...BASE_DOSSIER,
        checklist: [
          { type_piece: "cni", uploaded: true, filename: "ma-cni-2026.pdf" },
          { type_piece: "permis",   uploaded: false, filename: null },
          { type_piece: "revenus",  uploaded: false, filename: null },
          { type_piece: "domicile", uploaded: false, filename: null },
          { type_piece: "rib",      uploaded: false, filename: null },
        ],
      }),
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("ma-cni-2026.pdf")).toBeInTheDocument();
    });
  });

  // ── Historique ───────────────────────────────────────────────────────────

  it("affiche l'historique chronologique des changements de statut", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...BASE_DOSSIER,
        status: "en_instruction",
        historique: [
          {
            ancien_status: null,
            nouveau_status: "brouillon",
            commentaire: null,
            created_at: "2026-05-01T09:00:00Z",
          },
          {
            ancien_status: "brouillon",
            nouveau_status: "depose",
            commentaire: "Dossier déposé par le client.",
            created_at: "2026-05-05T14:30:00Z",
          },
          {
            ancien_status: "depose",
            nouveau_status: "en_instruction",
            commentaire: null,
            created_at: "2026-05-07T10:00:00Z",
          },
        ],
      }),
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      const hist = screen.getByRole("list", { name: /historique/i });
      expect(screen.getByText("Dossier déposé par le client.")).toBeInTheDocument();
      expect(within(hist).getAllByRole("listitem")).toHaveLength(3);
    });
  });

  it("n'affiche pas la section historique quand la liste est vide", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.queryByRole("list", { name: /historique/i })).not.toBeInTheDocument();
    });
  });

  it("affiche les badges de statut dans l'historique", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...BASE_DOSSIER,
        historique: [
          {
            ancien_status: "brouillon",
            nouveau_status: "depose",
            commentaire: null,
            created_at: "2026-05-05T14:30:00Z",
          },
        ],
      }),
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      // "Brouillon" badge (dans l'en-tête ET dans l'historique comme ancien_status)
      const brouillonBadges = screen.getAllByText("Brouillon");
      expect(brouillonBadges.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Déposé")).toBeInTheDocument();
    });
  });

  // ── Tests existants conservés ────────────────────────────────────────────

  it("affiche la checklist et les pièces manquantes avec soumission bloquée", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...BASE_DOSSIER,
        id: 12,
        reference: "DOS-2026-00012",
      }),
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /retour à mes dossiers/i })).toHaveAttribute(
        "href",
        "/mes-dossiers",
      );
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
        json: async () => BASE_DOSSIER,
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
          ...BASE_DOSSIER,
          checklist: [
            { type_piece: "cni",     uploaded: true,  filename: "cni.pdf" },
            { type_piece: "permis",  uploaded: false, filename: null },
            { type_piece: "revenus", uploaded: false, filename: null },
            { type_piece: "domicile",uploaded: false, filename: null },
            { type_piece: "rib",     uploaded: false, filename: null },
          ],
          missing_pieces: ["permis", "revenus", "domicile", "rib"],
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

    expect(screen.queryByText(/chargement du dossier/i)).not.toBeInTheDocument();
  });

  it("affiche le récapitulatif puis soumet avec succès", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => DOSSIER_COMPLET,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...DOSSIER_COMPLET, status: "depose" }),
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
      expect(screen.getByRole("alert")).toHaveTextContent("Dossier introuvable");
    });
  });

  it("garde le récapitulatif ouvert et affiche l'erreur si la soumission échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...DOSSIER_COMPLET, created_at: "invalid-date" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: "Soumission impossible." }),
      } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /voir le récapitulatif/i })).toBeEnabled();
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /voir le récapitulatif/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmer la soumission/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Soumission impossible.");
      expect(screen.getByText(/récapitulatif avant confirmation/i)).toBeInTheDocument();
    });
  });

  it("permet d'annuler le récapitulatif de soumission", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => DOSSIER_COMPLET,
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
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("Uploader CNI") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["txt"], "bad.txt", { type: "text/plain" })] },
    });

    await waitFor(() => {
      expect(screen.getByText(/format invalide/i)).toBeInTheDocument();
    });
  });

  it("bloque un upload quand le fichier dépasse 10 Mo", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => BASE_DOSSIER,
    } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument();
    });

    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Uploader CNI") as HTMLInputElement, {
      target: { files: [oversized] },
    });

    await waitFor(() => {
      expect(screen.getByText(/fichier trop volumineux/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur de pré-signature si upload-init échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => BASE_DOSSIER } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Uploader CNI") as HTMLInputElement, {
      target: { files: [new File(["ok"], "cni.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByText(/pré-signature impossible/i)).toBeInTheDocument();
    });
  });

  it("affiche une erreur si l'upload S3 échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => BASE_DOSSIER } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://s3.example/upload",
          s3_key: "dossiers/13/cni/cni.pdf",
          headers: { "Content-Type": "application/pdf", "x-amz-checksum-sha256": "abc" },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Uploader CNI") as HTMLInputElement, {
      target: { files: [new File(["ok"], "cni.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByText(/upload minio échoué/i)).toBeInTheDocument();
    });
  });

  it("affiche un fallback si la validation upload-complete échoue", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => BASE_DOSSIER } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          upload_url: "https://s3.example/upload",
          s3_key: "dossiers/13/cni/cni.pdf",
          headers: { "Content-Type": "application/pdf", "x-amz-checksum-sha256": "abc" },
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);

    render(<DossierDetailPage />);
    await waitFor(() => expect(screen.getByLabelText("Uploader CNI")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Uploader CNI") as HTMLInputElement, {
      target: { files: [new File(["ok"], "cni.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByText(/validation du document impossible/i)).toBeInTheDocument();
    });
  });

  // ── Contrat & signature (US-06-07) ─────────────────────────────────────

  it("charge et affiche le contrat lorsque l'API renvoie contrat + markdown", async () => {
    jest.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input.toString();
      if (u.includes("/contrat") && !u.includes("demander-signature")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            markdown: "# Contrat\n\nCorps **markdown**.",
            reference: "CTR-2026-00013",
            signed_at: null,
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => DOSSIER_EN_SIGNATURE,
      } as Response);
    });

    render(<DossierDetailPage />);

    await waitFor(() => {
      const md = screen.getByTestId("markdown-body");
      expect(md).toHaveTextContent("# Contrat");
      expect(md).toHaveTextContent("Corps **markdown**.");
    });
    expect(screen.getByRole("button", { name: /^Signer le contrat$/i })).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement du contrat échoue", async () => {
    jest.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input.toString();
      if (u.includes("/contrat") && !u.includes("demander-signature")) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ detail: "Accès refusé." }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => DOSSIER_EN_SIGNATURE,
      } as Response);
    });

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/accès refusé/i)).toBeInTheDocument();
    });
  });

  it("ouvre la modale et envoie la demande de signature (POST)", async () => {
    jest.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof input === "string" ? input : input.toString();
      if (init?.method === "POST" && u.includes("demander-signature")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: "Un email avec le lien vous a été envoyé." }),
        } as Response);
      }
      if (u.includes("/contrat") && !u.includes("demander-signature")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            markdown: "# C",
            reference: "CTR-2026-00013",
            signed_at: null,
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => DOSSIER_EN_SIGNATURE,
      } as Response);
    });

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Signer le contrat$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Signer le contrat$/i }));

    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: /recevoir le lien par email/i }));

    await waitFor(() => {
      expect(screen.getByText(/un email avec le lien vous a été envoyé/i)).toBeInTheDocument();
    });
  });

  it("n'affiche pas le bouton signer si le contrat est déjà signé", async () => {
    jest.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input.toString();
      if (u.includes("/contrat") && !u.includes("demander-signature")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            markdown: "# OK",
            reference: "CTR-X",
            signed_at: "2026-05-10T12:00:00Z",
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ...DOSSIER_EN_SIGNATURE,
          status: "attente_livraison",
          contrat: {
            reference: "CTR-X",
            signed_at: "2026-05-10T12:00:00Z",
            can_sign: false,
          },
        }),
      } as Response);
    });

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/signé le/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /^Signer le contrat$/i })).not.toBeInTheDocument();
  });

  it("affiche la section livraison quand l'API expose livraison (US-06-10)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ...BASE_DOSSIER,
        status: "livraison_planifiee",
        lld_pricing: null,
        contrat: null,
        checklist: BASE_DOSSIER.checklist,
        missing_pieces: BASE_DOSSIER.missing_pieces,
        can_submit: false,
        livraison: {
          prevue_at: "2026-07-20T14:00:00Z",
          lieu: "Garage Gaudin",
        },
      }),
    } as Response);

    render(<DossierDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /rendez-vous de livraison/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/garage gaudin/i)).toBeInTheDocument();
    expect(screen.getByText(/date et heure/i)).toBeInTheDocument();
  });
});
