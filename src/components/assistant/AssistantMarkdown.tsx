import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface AssistantMarkdownProps {
  content: string;
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h3 className="font-display text-base font-bold text-[var(--as-text)] mt-3 first:mt-0 mb-1.5 leading-snug">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className="font-display text-[15px] font-bold text-[var(--as-text)] mt-3 first:mt-0 mb-1.5 leading-snug">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h5 className="font-display text-sm font-semibold text-[var(--as-text)] mt-2.5 first:mt-0 mb-1 leading-snug">
      {children}
    </h5>
  ),
  h4: ({ children }) => (
    <h6 className="font-display text-sm font-medium text-[var(--as-text)] mt-2 first:mt-0 mb-1 leading-snug">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="my-2 first:mt-0 last:mb-0 leading-relaxed text-[var(--as-text)]">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--as-text)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-2 first:mt-0 last:mb-0 list-disc pl-5 space-y-1 text-[var(--as-text)] [&_ul]:mt-1 [&_ul]:mb-0 [&_ol]:mt-1 [&_ol]:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 first:mt-0 last:mb-0 list-decimal pl-5 space-y-1 text-[var(--as-text)] [&_ul]:mt-1 [&_ul]:mb-0 [&_ol]:mt-1 [&_ol]:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2.5 first:mt-0 last:mb-0 border-l-3 border-[var(--as-primary)] pl-3.5 py-0.5 text-[var(--as-text-muted)] italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    const safeHref = href || '';
    const isExternal = /^https?:\/\//i.test(safeHref);
    return (
      <a
        href={safeHref}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className="as-text-accent font-medium underline underline-offset-2 hover:opacity-85 break-words"
      >
        {children}
      </a>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2.5 first:mt-0 last:mb-0 overflow-x-auto rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-page)] p-3 text-xs font-mono leading-relaxed text-[var(--as-text)] [&_code]:bg-transparent [&_code]:p-0 [&_code]:border-0 [&_code]:rounded-none [&_code]:text-inherit">
      {children}
    </pre>
  ),
  code: ({ children, className }) => {
    const isMathNode =
      typeof className === 'string' && className.includes('language-math');
    if (isMathNode) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code
        className={`rounded px-1.5 py-0.5 text-[0.85em] font-mono bg-[var(--as-bg-page)] border border-[var(--as-border)] text-[var(--as-text)] ${
          className ?? ''
        }`.trim()}
      >
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="my-2.5 first:mt-0 last:mb-0 w-full overflow-x-auto rounded-lg border border-[var(--as-border)]">
      <table className="w-full border-collapse text-left text-xs text-[var(--as-text)]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[var(--as-bg-surface)] border-b border-[var(--as-border)]">
      {children}
    </thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-[var(--as-border)]">{children}</tbody>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 font-semibold text-[var(--as-text)] whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[var(--as-text-muted)] align-top">{children}</td>
  ),
  hr: () => <hr className="my-3 border-[var(--as-border)]" />,
};

export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  return (
    <div className="text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false }]]}
        skipHtml
        urlTransform={defaultUrlTransform}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
