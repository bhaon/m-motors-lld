"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const navy = "var(--navy)";
const muted = "var(--muted)";
const border = "var(--border)";

/** Styles communs pour titres, listes et tableaux (contrats / avenants générés en Markdown). */
const mdComponents: Components = {
  h1: ({ children }) => (
    <h1
      style={{
        fontFamily: "Syne, sans-serif",
        fontSize: "1.2rem",
        margin: "0 0 .6rem",
        color: navy,
        lineHeight: 1.25,
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      style={{
        fontFamily: "Syne, sans-serif",
        fontSize: "1.05rem",
        margin: "1rem 0 .45rem",
        color: navy,
        lineHeight: 1.3,
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      style={{
        fontFamily: "Syne, sans-serif",
        fontSize: ".95rem",
        margin: ".85rem 0 .35rem",
        color: navy,
      }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontSize: ".9rem", margin: ".65rem 0 .3rem", color: navy }}>{children}</h4>
  ),
  p: ({ children }) => (
    <p style={{ margin: "0 0 .65rem", lineHeight: 1.55, color: "#334155", fontSize: ".88rem" }}>{children}</p>
  ),
  ul: ({ children }) => (
    <ul style={{ margin: "0 0 .75rem", paddingLeft: "1.2rem", lineHeight: 1.5, fontSize: ".88rem" }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: "0 0 .75rem", paddingLeft: "1.2rem", lineHeight: 1.5, fontSize: ".88rem" }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ marginBottom: ".2rem" }}>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: "0 0 .75rem",
        padding: ".5rem .85rem",
        borderLeft: "4px solid #0ea5e9",
        background: "#f8fafc",
        color: "#475569",
        fontSize: ".85rem",
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr style={{ border: 0, borderTop: `1px solid ${border}`, margin: "1rem 0" }} />,
  strong: ({ children }) => <strong style={{ fontWeight: 700, color: navy }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: "italic", color: muted }}>{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      style={{ color: "#0284c7", textDecoration: "underline" }}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: "auto", marginBottom: ".75rem", maxWidth: "100%" }}>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          fontSize: ".8rem",
          border: `1px solid ${border}`,
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: "rgba(13,27,75,.06)" }}>{children}</thead>,
  th: ({ children }) => (
    <th
      style={{
        border: `1px solid ${border}`,
        padding: ".35rem .5rem",
        textAlign: "left",
        fontWeight: 700,
        color: navy,
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: `1px solid ${border}`, padding: ".35rem .5rem", verticalAlign: "top" }}>{children}</td>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  pre: ({ children }) => (
    <pre
      style={{
        margin: "0 0 .75rem",
        padding: ".75rem",
        background: "#f1f5f9",
        borderRadius: 8,
        border: `1px solid ${border}`,
        fontSize: ".76rem",
        lineHeight: 1.45,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </pre>
  ),
  code(props) {
    const { children, className } = props;
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code
        style={{
          background: "#f1f5f9",
          padding: "0 .2rem",
          borderRadius: 4,
          fontSize: ".84em",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {children}
      </code>
    );
  },
};

interface MarkdownBodyProps {
  /** Contenu Markdown (contrat, avenant, etc.). */
  source: string;
}

/**
 * Affiche du Markdown en HTML typographié (titres, listes, tableaux GFM, blocs de code).
 */
export default function MarkdownBody({ source }: Readonly<MarkdownBodyProps>) {
  return (
    <div data-testid="markdown-body" style={{ color: "#334155" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
