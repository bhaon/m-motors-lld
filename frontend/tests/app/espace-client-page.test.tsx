import { render, screen } from "@testing-library/react";
import EspaceClientPage from "@/app/espace-client/page";

const headersMock = jest.fn();
const redirectMock = jest.fn();

jest.mock("next/headers", () => ({
  headers: () => headersMock(),
}));

jest.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

describe("EspaceClientPage", () => {
  const originalEnv = { ...process.env };
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("rend la page quand la session est valide", async () => {
    headersMock.mockResolvedValue({
      get: () => "access_token=jwt",
    });
    fetchMock.mockResolvedValue({ ok: true });

    const tree = await EspaceClientPage();
    render(tree);

    expect(screen.getByText(/espace client/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/auth\/me$/),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: { cookie: "access_token=jwt" },
      }),
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirige vers /connexion quand la session est invalide", async () => {
    headersMock.mockResolvedValue({
      get: () => "",
    });
    fetchMock.mockResolvedValue({ ok: false });

    await EspaceClientPage();

    expect(redirectMock).toHaveBeenCalledWith("/connexion");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/auth\/me$/),
      expect.objectContaining({
        headers: undefined,
      }),
    );
  });

  it("utilise API_INTERNAL_URL quand défini", async () => {
    process.env.API_INTERNAL_URL = "http://backend:8000/";
    headersMock.mockResolvedValue({ get: () => "access_token=jwt" });
    fetchMock.mockResolvedValue({ ok: true });

    await EspaceClientPage();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/auth/me",
      expect.any(Object),
    );
  });

  it("utilise NEXT_PUBLIC_API_URL quand API_INTERNAL_URL est absent", async () => {
    delete process.env.API_INTERNAL_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
    headersMock.mockResolvedValue({ get: () => "access_token=jwt" });
    fetchMock.mockResolvedValue({ ok: true });

    await EspaceClientPage();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/auth/me",
      expect.any(Object),
    );
  });
});
