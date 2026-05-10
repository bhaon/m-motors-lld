import { render, waitFor } from "@testing-library/react";
import InscriptionPage from "@/app/inscription/page";

const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe("InscriptionPage", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it("redirige vers l'accueil avec le parametre ouvrant la modale d'inscription", async () => {
    render(<InscriptionPage />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/?inscription=1");
    });
  });
});
