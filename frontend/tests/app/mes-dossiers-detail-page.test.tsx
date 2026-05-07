import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DossierDetailPage from "@/app/mes-dossiers/[id]/page";

describe("DossierDetailPage", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
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

    render(<DossierDetailPage params={{ id: "12" }} />);

    await waitFor(() => {
      expect(screen.getByText(/soumission bloquée/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Permis de conduire/i).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /voir le récapitulatif/i })).toBeDisabled();
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

    render(<DossierDetailPage params={{ id: "13" }} />);

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
});
