import { render, screen } from "@testing-library/react";
import { SAMPLE_VEHICLES } from "../fixtures/vehicles";
import { fetchVehicles } from "@/app/fetchVehicles";
import Home from "@/app/page";

jest.mock("@/app/fetchVehicles", () => ({
  fetchVehicles: jest.fn(),
}));

const mockedFetch = jest.mocked(fetchVehicles);

describe("Home (page.tsx)", () => {
  beforeEach(() => {
    mockedFetch.mockClear();
    mockedFetch.mockResolvedValue(SAMPLE_VEHICLES.slice(0, 2));
  });

  it("compose la page catalogue à partir des véhicules récupérés", async () => {
    const tree = await Home();
    render(tree);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByText(/Trouvez votre véhicule/i)).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
