import { fireEvent, render, screen } from "@testing-library/react";
import DossierRejectModal, { MOTIF_REJET_MIN_LENGTH } from "@/components/DossierRejectModal";

describe("DossierRejectModal", () => {
  it("exige au moins MOTIF_REJET_MIN_LENGTH caractères pour activer la confirmation", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    render(
      <DossierRejectModal
        dossierReference="DOS-001"
        submitting={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const confirm = screen.getByRole("button", { name: /confirmer le rejet du dossier/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/motif de rejet/i), {
      target: { value: "a".repeat(MOTIF_REJET_MIN_LENGTH - 1) },
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/motif de rejet/i), {
      target: { value: "a".repeat(MOTIF_REJET_MIN_LENGTH) },
    });
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("a".repeat(MOTIF_REJET_MIN_LENGTH));
  });
});
