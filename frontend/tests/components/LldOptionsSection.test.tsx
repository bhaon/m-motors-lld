import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LldOptionsSection from "@/components/LldOptionsSection";

const basePricing = {
  base_mensualite_ht: 200,
  options_supplement_ht: 0,
  total_mensualite_ht: 200,
  editable: true,
  edit_context: "brouillon" as const,
  items: [
    {
      code: "assurance",
      label: "Assurance tous risques",
      description: "Couverture.",
      surcout_mensuel_ht: 39,
      selected: false,
    },
    {
      code: "assistance",
      label: "Assistance",
      description: "Aide.",
      surcout_mensuel_ht: 9,
      selected: false,
    },
    {
      code: "entretien",
      label: "Entretien",
      description: "Révisions.",
      surcout_mensuel_ht: 29,
      selected: false,
    },
    {
      code: "controle_technique",
      label: "Contrôle technique",
      description: "CT.",
      surcout_mensuel_ht: 5,
      selected: false,
    },
  ],
};

describe("LldOptionsSection", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("affiche les quatre options et le total", () => {
    const onUp = jest.fn();
    render(<LldOptionsSection dossierId="7" pricing={basePricing} onPricingUpdated={onUp} />);
    expect(screen.getByText(/Assurance tous risques/i)).toBeInTheDocument();
    expect(screen.getByText(/Contrôle technique/i)).toBeInTheDocument();
    expect(screen.getByText(/Total mensuel HT/i)).toBeInTheDocument();
  });

  it("ouvre la confirmation puis appelle PATCH au validate (US-07-02)", async () => {
    const onUp = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        ...basePricing,
        edit_context: "brouillon",
        options_supplement_ht: 39,
        total_mensualite_ht: 239,
        items: basePricing.items.map((it) =>
          it.code === "assurance" ? { ...it, selected: true } : it,
        ),
      }),
    });

    render(<LldOptionsSection dossierId="7" pricing={basePricing} onPricingUpdated={onUp} />);
    const cb = screen.getByRole("checkbox", { name: /Assurance tous risques/i });
    fireEvent.click(cb);

    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /enregistrer les modifications/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^confirmer$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/dossiers/7/options-lld"),
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(onUp).toHaveBeenCalled();
    });
  });
});
