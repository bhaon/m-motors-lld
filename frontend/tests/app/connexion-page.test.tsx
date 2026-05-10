import { render, waitFor } from "@testing-library/react";
import ConnexionPage from "@/app/connexion/page";

const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

describe("ConnexionPage", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it("redirige vers l'accueil avec le parametre ouvrant la modale de connexion", async () => {
    render(<ConnexionPage />);
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/?connexion=1");
    });
  });
});
