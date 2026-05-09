import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BackofficeReportingPage from "@/app/backoffice/reporting/page";

function mockReportingPayload(period = "month") {
  return {
    period,
    period_start: "2026-03-01T00:00:00.000Z",
    period_end_exclusive: "2026-04-01T00:00:00.000Z",
    cohort_count: 12,
    by_status: {
      brouillon: 0,
      depose: 2,
      en_instruction: 3,
      valide: 5,
      rejete: 2,
      annule: 0,
    },
    validation_rate: 0.7142857142857143,
    avg_processing_days: 4.5,
  };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockReportingPayload(),
  });
});

afterEach(() => jest.restoreAllMocks());

describe("BackofficeReportingPage", () => {
  it("charge la synthèse pour la période mois par défaut", async () => {
    render(<BackofficeReportingPage />);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/reporting/dossiers?period=month"),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());
    expect(screen.getByText(/reporting dossiers/i)).toBeInTheDocument();
  });

  it("change de période et relance l’API", async () => {
    render(<BackofficeReportingPage />);
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^trimestre$/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("period=quarter"),
        expect.any(Object),
      ),
    );
  });

  it("affiche un message si l’API refuse l’accès (403)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Interdit" }),
    });

    render(<BackofficeReportingPage />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/superviseurs/i),
    );
  });

  it("déclenche le téléchargement CSV au clic", async () => {
    const blob = new Blob(["ok"], { type: "text/csv" });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockReportingPayload(),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => blob,
      });

    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<BackofficeReportingPage />);
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /exporter csv/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/reporting/dossiers/export.csv?period=month"),
        expect.objectContaining({ credentials: "include" }),
      ),
    );

    clickSpy.mockRestore();
  });

  it("affiche — pour taux et délai lorsque l’API renvoie null", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...mockReportingPayload(),
        validation_rate: null,
        avg_processing_days: null,
      }),
    });

    render(<BackofficeReportingPage />);
    await waitFor(() => {
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("affiche une erreur si l’export CSV renvoie un corps JSON d’erreur", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockReportingPayload(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ detail: "Export interdit." }),
      });

    render(<BackofficeReportingPage />);
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /exporter csv/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/export interdit/i),
    );
  });

  it("affiche une erreur si l’export CSV renvoie du texte non JSON", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockReportingPayload(),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => "Bad Gateway upstream",
      });

    render(<BackofficeReportingPage />);
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /exporter csv/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Bad Gateway/i),
    );
  });
});
