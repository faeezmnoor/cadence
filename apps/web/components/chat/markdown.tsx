"use client";

/**
 * Markdown renderer for chat bubbles.
 *
 * Whitelist (blueprint §2.4): strong, em, ul/ol, blockquote, inline+block
 * code, links (http/https/mailto), hr, h3–h5. Raw HTML disabled, images
 * stripped, links forced to safe schemes + target=_blank rel=noopener.
 *
 * The fenced code block is delegated to <CodeBlock> for monospace + copy.
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./code-block";

function isSafeHref(href: string | undefined): href is string {
  if (!href) return false;
  // Allow protocol-relative? No — force http(s) or mailto.
  return /^(https?:|mailto:)/i.test(href);
}

const components: Components = {
  // Inline + block code share this callback in react-markdown v10. Tell
  // them apart by the language class (set only for fenced blocks) and the
  // presence of a newline in the payload.
  code({ className, children, ...rest }) {
    const text = String(children ?? "").replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className ?? "");
    const isFenced = !!match || text.includes("\n");
    if (!isFenced) {
      return (
        <code
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
          {...rest}
        >
          {text}
        </code>
      );
    }
    return <CodeBlock language={match?.[1]} code={text} />;
  },
  // The fenced block wraps its <code> in a <pre>; we render our own <pre>
  // inside CodeBlock so kill the outer wrapper.
  pre({ children }) {
    return <>{children}</>;
  },
  // Force safe link rendering.
  a({ href, children, ...rest }) {
    if (!isSafeHref(href)) {
      return <span>{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="underline underline-offset-2 hover:no-underline"
        {...rest}
      >
        {children}
      </a>
    );
  },
  // Constrain headings — agent shouldn't emit H1 in chat.
  h1: ({ children }) => (
    <h3 className="mt-2 mb-1 text-base font-semibold">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mt-2 mb-1 text-base font-semibold">{children}</h3>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 mb-1 text-base font-semibold">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-2 mb-1 text-sm font-semibold">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mt-2 mb-1 text-sm font-semibold">{children}</h5>
  ),
  h6: ({ children }) => (
    <h5 className="mt-2 mb-1 text-sm font-semibold">{children}</h5>
  ),
  ul: ({ children }) => (
    <ul className="my-1 ml-5 list-disc space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 ml-5 list-decimal space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-border" />,
  p: ({ children }) => <p className="leading-snug">{children}</p>,
  // Strip images — never trusted in a chat bubble.
  img: () => null,
  // Markdown tables → render as preformatted block in v1 (blueprint §2.4).
  table: ({ children }) => (
    <pre className="my-1 overflow-x-auto rounded bg-muted p-2 text-[0.85em] font-mono">
      {children}
    </pre>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat space-y-1 whitespace-pre-wrap break-words text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
