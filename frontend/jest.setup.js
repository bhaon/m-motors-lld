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
