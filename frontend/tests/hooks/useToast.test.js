import { act, renderHook } from "@testing-library/react";
import { useToast } from "@/hooks/useToast";

describe("useToast", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("affiche puis masque le toast après 3 secondes", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast("OK");
    });

    expect(result.current.toast.visible).toBe(true);
    expect(result.current.toast.message).toBe("OK");

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.toast.visible).toBe(false);
    expect(result.current.toast.message).toBe("OK");
  });
});
