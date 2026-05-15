import { render, screen, waitFor } from "@testing-library/react";
import BackofficeContratsEnCoursPage from "@/app/backoffice/contrats-en-cours/page";

function mockContratsPayload() {
  return {
    total: 1,
    items: [
      {
        id: 1,
        reference: "DOS-611",
        client: {
          id: 10,
          email: "client@ex.com",
          first_name: "Jean",
          last_name: "Dupont",
        },
        vehicle: { make: "Peugeot", model: "308", year: 2024, mensualite: 299 },
        gestionnaire_email: "gest@ex.com",
        duree_mois: 36,
        date_debut: "2024-01-01",
        date_fin: "2027-01-01",
        total_mensualite_ht: 350,
        location_phase: "year2",
        fin_dans_3_mois: true,
        jours_restants: 60,
      },
    ],
  };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockContratsPayload(),
  });
});

afterEach(() => jest.restoreAllMocks());

describe("BackofficeContratsEnCoursPage", () => {
  it("charge le tableau des contrats en cours", async () => {
    render(<BackofficeContratsEnCoursPage />);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/reporting/contrats-en-cours"),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("DOS-611")).toBeInTheDocument());
    expect(screen.getAllByText(/2ème année/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/≤ 3 mois/i)).toBeInTheDocument();
  });

  it("affiche un message si l’API refuse l’accès (403)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Interdit" }),
    });

    render(<BackofficeContratsEnCoursPage />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/superviseurs/i),
    );
  });
});
