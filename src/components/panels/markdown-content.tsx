import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
	h1: ({ children }) => <h1 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h1>,
	h2: ({ children }) => (
		<h2 className="mb-2 mt-3 text-[13px] font-semibold first:mt-0">{children}</h2>
	),
	h3: ({ children }) => (
		<h3 className="mb-2 mt-3 text-[13px] font-semibold first:mt-0">{children}</h3>
	),
	h4: ({ children }) => (
		<h4 className="mb-2 mt-3 text-[13px] font-semibold first:mt-0">{children}</h4>
	),
	p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
	ul: ({ children }) => <ul className="mb-3 list-disc pl-4 last:mb-0">{children}</ul>,
	ol: ({ children }) => <ol className="mb-3 list-decimal pl-4 last:mb-0">{children}</ol>,
	li: ({ children }) => <li className="mb-1">{children}</li>,
	code: ({ children }) => (
		<code className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px]">{children}</code>
	),
	pre: ({ children }) => (
		<section
			// biome-ignore lint/a11y/noNoninteractiveTabindex: horizontal code overflow needs keyboard access
			tabIndex={0}
			aria-label="Code sample"
			className="mb-3 max-w-full overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 text-[11px] leading-relaxed [overflow-wrap:normal] [&_code]:bg-transparent [&_code]:p-0 last:mb-0"
		>
			<pre>{children}</pre>
		</section>
	),
	blockquote: ({ children }) => (
		<blockquote className="mb-1 border-l-2 border-border pl-2 italic last:mb-0">
			{children}
		</blockquote>
	),
	table: ({ children }) => (
		<section
			aria-label="Response table"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: horizontal table overflow needs keyboard access
			tabIndex={0}
			className="mb-3 max-w-full overflow-x-auto last:mb-0"
		>
			<table className="w-full min-w-96 border-collapse text-xs">{children}</table>
		</section>
	),
	th: ({ children }) => (
		<th className="border border-border/50 bg-background/50 px-2 py-1.5 text-left font-medium whitespace-nowrap [overflow-wrap:normal]">
			{children}
		</th>
	),
	td: ({ children }) => (
		<td className="border border-border/50 px-2 py-1.5 [overflow-wrap:normal]">{children}</td>
	),
	a: ({ href, children }) => (
		<a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	),
	strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
	hr: () => <hr className="my-3 border-border/50" />,
};

/** Renders AI responses as markdown. rehype-raw is intentionally omitted —
 *  LLM output is untrusted and raw HTML is escaped by default. */
export function MarkdownContent({ content }: { content: string }) {
	return (
		<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
			{content}
		</ReactMarkdown>
	);
}
