require("@testing-library/jest-dom");

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props) => {
    const React = require("react");
    const { fill, ...imgProps } = props;
    return React.createElement("img", imgProps);
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }) => {
    const React = require("react");
    return React.createElement("a", { href, ...props }, children);
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  useParams: () => ({}),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/** react-markdown est en ESM : le mock évite d’étendre indéfiniment transpilePackages pour Jest. */
jest.mock("@/components/MarkdownBody", () => ({
  __esModule: true,
  default: function MarkdownBodyMock({ source }) {
    const React = require("react");
    return React.createElement(
      "div",
      { "data-testid": "markdown-body", style: { whiteSpace: "pre-wrap" } },
      source,
    );
  },
}));
