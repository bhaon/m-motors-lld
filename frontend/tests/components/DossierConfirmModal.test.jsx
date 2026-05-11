import { fireEvent, render, screen } from "@testing-library/react";
import DossierConfirmModal from "@/components/DossierConfirmModal";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";

describe("DossierConfirmModal", () => {
  it("annule avec Escape, fond et bouton Annuler", () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const vehicle = SAMPLE_VEHICLES[0];
    const { unmount } = render(
      <DossierConfirmModal
        vehicle={vehicle}
        type="lld"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(document.body.classList.contains("modal-open")).toBe(true);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(
      screen.getByRole("button", { name: "Annuler le dépôt (fond de modale)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();

    unmount();
    expect(document.body.classList.contains("modal-open")).toBe(false);
  });

  it("confirme le dépôt", () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const vehicle = SAMPLE_VEHICLES[0];
    render(
      <DossierConfirmModal
        vehicle={vehicle}
        type="achat"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmer le dépôt" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("désactive le bouton de confirmation lorsque confirmLocked", () => {
    const onConfirm = jest.fn();
    render(
      <DossierConfirmModal
        vehicle={SAMPLE_VEHICLES[0]}
        type="lld"
        onCancel={jest.fn()}
        onConfirm={onConfirm}
        confirmLocked
      />,
    );
    expect(screen.getByRole("button", { name: "Vérification de la session…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Vérification de la session…" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
