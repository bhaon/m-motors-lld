import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BackofficeLldOptionsPage from "@/app/backoffice/options-lld/page";

const mockItems = [
  {
    code: "assurance",
    label: "Assurance tous risques",
    description: "Desc",
    enabled: true,
    surcout_mensuel_ht: 39,
    flag_updated_at: null,
  },
  {
    code: "assistance",
    label: "Assistance",
    description: "Desc",
    enabled: true,
    surcout_mensuel_ht: 9,
    flag_updated_at: null,
  },
];

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: mockItems }),
  });
});

afterEach(() => jest.restoreAllMocks());

describe("BackofficeLldOptionsPage (US-07-03)", () => {
  it("charge le catalogue back-office", async () => {
    render(<BackofficeLldOptionsPage />);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/backoffice/lld-catalog"),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /Options LLD — catalogue/i })).toBeInTheDocument();
  });

  it("ouvre la modale d’historique", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: mockItems }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          option_code: "assurance",
          history: [{ id: 1, price_ht: 39, valid_from: "2026-01-01T00:00:00Z", created_by_user_id: null }],
        }),
      });

    render(<BackofficeLldOptionsPage />);
    await waitFor(() => expect(screen.getByText("assurance")).toBeInTheDocument());

    const histButtons = screen.getAllByRole("button", { name: /^Historique$/i });
    fireEvent.click(histButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Historique — assurance/i })).toBeInTheDocument();
      expect(screen.getByText(/39\.00/)).toBeInTheDocument();
    });
  });
});
