import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BackofficeDossierDetailPage from "@/app/backoffice/dossiers/[id]/page";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "42" }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePiece(type: string, uploaded = false, filename: string | null = null) {
  return { type_piece: type, uploaded, filename, uploaded_at: uploaded ? "2026-03-15T09:00:00Z" : null };
}

function makeDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    reference: "DET-2026-00042",
    type: "achat",
    status: "depose",
    submitted_at: "2026-03-15T10:00:00Z",
    created_at: "2026-03-14T08:00:00Z",
    motif_rejet: null,
    notes_internes: null,
    vehicle: { make: "Renault", model: "Clio", year: 2022 },
    client: { id: 10, email: "jean.dupont@example.com", first_name: "Jean", last_name: "Dupont" },
    pieces: [
      makePiece("cni", true, "cni.pdf"),
      makePiece("permis", true, "permis.pdf"),
      makePiece("revenus", false),
      makePiece("domicile", false),
      makePiece("rib", true, "rib.pdf"),
    ],
    historique: [],
    ...overrides,
  };
}

function mockFetch(response: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => response,
  });
}

beforeEach(() => mockFetch(makeDetail()));
afterEach(() => jest.restoreAllMocks());

// ── Rendu initial ─────────────────────────────────────────────────────────────

describe("BackofficeDossierDetailPage — rendu initial", () => {
  it("affiche la référence du dossier", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText("DET-2026-00042")).toBeInTheDocument());
  });

  it("affiche les informations client", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText("Jean Dupont")).toBeInTheDocument());
    expect(screen.getByText("jean.dupont@example.com")).toBeInTheDocument();
  });

  it("affiche les informations véhicule", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText(/renault clio/i)).toBeInTheDocument());
    expect(screen.getByText("2022")).toBeInTheDocument();
  });

  it("affiche le type de contrat", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getAllByText(/achat/i).length).toBeGreaterThan(0));
  });

  it("affiche le compteur de pièces (3/5)", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText(/3\/5/i)).toBeInTheDocument());
  });

  it("affiche le lien de retour vers la liste", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /← dossiers/i })).toBeInTheDocument(),
    );
  });
});

// ── Erreur API ────────────────────────────────────────────────────────────────

describe("BackofficeDossierDetailPage — erreur API", () => {
  it("affiche un message d'erreur si l'API répond non-ok", async () => {
    mockFetch({ detail: "Accès refusé." }, false);
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toContain("Accès refusé.");
  });

  it("affiche un message d'erreur en cas d'échec réseau", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});

// ── Pièces justificatives ─────────────────────────────────────────────────────

describe("BackofficeDossierDetailPage — pièces justificatives", () => {
  it("affiche les 5 types de pièces", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText("CNI")).toBeInTheDocument());
    expect(screen.getByText("Permis de conduire")).toBeInTheDocument();
    expect(screen.getByText("Justificatif de revenus")).toBeInTheDocument();
    expect(screen.getByText("Justificatif de domicile")).toBeInTheDocument();
    expect(screen.getByText("RIB")).toBeInTheDocument();
  });

  it("affiche un bouton 'Consulter' uniquement pour les pièces uploadées", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText("CNI")).toBeInTheDocument());
    // 3 pièces uploadées → 3 boutons Consulter
    const buttons = screen.getAllByRole("button", { name: /consulter/i });
    expect(buttons).toHaveLength(3);
  });

  it("affiche 'Déposée' pour les pièces uploadées et 'Manquante' pour les autres", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText("CNI")).toBeInTheDocument());
    // 3 uploadées, 2 manquantes
    expect(screen.getAllByText(/déposée/i)).toHaveLength(3);
    expect(screen.getAllByText(/manquante/i)).toHaveLength(2);
  });

  it("appelle l'API de download-url au clic sur Consulter", async () => {
    const downloadMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ download_url: "https://minio.ex/presigned/cni.pdf", filename: "cni.pdf" }),
    });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeDetail() })
      .mockImplementation(downloadMock);

    render(<BackofficeDossierDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /consulter cni/i }));

    await waitFor(() =>
      expect(downloadMock).toHaveBeenCalledWith(
        expect.stringContaining("/backoffice/42/pieces/cni/download-url"),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("ouvre la visionneuse après récupération de l'URL", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeDetail() })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ download_url: "https://minio.ex/presigned/cni.pdf", filename: "cni.pdf" }),
      });

    render(<BackofficeDossierDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /consulter cni/i }));

    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /visionneuse/i })).toBeInTheDocument(),
    );
  });

  it("ferme la visionneuse avec le bouton ×", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeDetail() })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ download_url: "https://minio.ex/presigned/cni.pdf", filename: "cni.pdf" }),
      });

    render(<BackofficeDossierDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /consulter cni/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /fermer la visionneuse/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("affiche un iframe pour les fichiers PDF", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeDetail() })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ download_url: "https://minio.ex/presigned/cni.pdf", filename: "cni.pdf" }),
      });

    render(<BackofficeDossierDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /consulter cni/i }));

    await waitFor(() => expect(screen.getByTitle("cni.pdf")).toBeInTheDocument());
  });

  it("affiche un img pour les fichiers image", async () => {
    const detailWithImage = makeDetail({
      pieces: [
        makePiece("cni", true, "cni.jpg"),
        makePiece("permis", false),
        makePiece("revenus", false),
        makePiece("domicile", false),
        makePiece("rib", false),
      ],
    });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => detailWithImage })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ download_url: "https://minio.ex/presigned/cni.jpg", filename: "cni.jpg" }),
      });

    render(<BackofficeDossierDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /consulter cni/i }));

    await waitFor(() => expect(screen.getByRole("img", { name: "cni.jpg" })).toBeInTheDocument());
  });
});

// ── Historique ────────────────────────────────────────────────────────────────

describe("BackofficeDossierDetailPage — historique", () => {
  it("affiche l'historique des changements de statut", async () => {
    const detail = makeDetail({
      status: "en_instruction",
      historique: [
        {
          ancien_status: "depose",
          nouveau_status: "en_instruction",
          commentaire: "Pris en charge par Marie Martin",
          created_at: "2026-03-16T09:00:00Z",
        },
      ],
    });
    mockFetch(detail);
    render(<BackofficeDossierDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole("list", { name: /historique/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/pris en charge par marie martin/i)).toBeInTheDocument();
  });

  it("n'affiche pas la section historique si vide", async () => {
    mockFetch(makeDetail({ historique: [] }));
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText("DET-2026-00042")).toBeInTheDocument());
    expect(screen.queryByRole("list", { name: /historique/i })).not.toBeInTheDocument();
  });
});

// ── Prise en charge ───────────────────────────────────────────────────────────

describe("BackofficeDossierDetailPage — prise en charge", () => {
  it("affiche le bouton 'Prendre en charge' pour un dossier déposé", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /prendre en charge le dossier det-2026-00042/i }),
      ).toBeInTheDocument(),
    );
  });

  it("n'affiche pas le bouton pour un dossier en_instruction", async () => {
    mockFetch(makeDetail({ status: "en_instruction" }));
    render(<BackofficeDossierDetailPage />);
    await waitFor(() => expect(screen.getByText("DET-2026-00042")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /prendre en charge/i })).not.toBeInTheDocument();
  });

  it("met à jour le statut et affiche un toast après prise en charge", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeDetail() })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 42, reference: "DET-2026-00042", status: "en_instruction", gestionnaire_id: 5 }),
      });

    render(<BackofficeDossierDetailPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /prendre en charge le dossier det-2026-00042/i }),
    );

    // StatusBadge utilise aussi role="status" — on vérifie le toast via son contenu textuel
    await waitFor(() =>
      expect(screen.getByText(/dossier det-2026-00042 pris en charge/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /prendre en charge/i })).not.toBeInTheDocument();
  });

  it("affiche une erreur si la prise en charge échoue", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeDetail() })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: "Impossible de prendre en charge." }),
      });

    render(<BackofficeDossierDetailPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /prendre en charge le dossier det-2026-00042/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/impossible de prendre en charge/i),
    );
  });
});

// ── Lien depuis la liste ───────────────────────────────────────────────────────

describe("BackofficeDossierDetailPage — navigation", () => {
  it("appelle l'API avec le bon id (42)", async () => {
    render(<BackofficeDossierDetailPage />);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/backoffice/42"),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });
});
