import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
	h1: ({ children }) => <h1 className="mb-1 text-sm font-bold">{children}</h1>,
	h2: ({ children }) => <h2 className="mb-1 text-xs font-bold">{children}</h2>,
	h3: ({ children }) => <h3 className="mb-0.5 text-xs font-bold">{children}</h3>,
	h4: ({ children }) => <h4 className="mb-0.5 text-xs font-semibold">{children}</h4>,
	p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
	ul: ({ children }) => <ul className="mb-1 list-disc pl-4 last:mb-0">{children}</ul>,
	ol: ({ children }) => <ol className="mb-1 list-decimal pl-4 last:mb-0">{children}</ol>,
	li: ({ children }) => <li className="mb-0.5">{children}</li>,
	code: ({ className, children }) => {
		const isBlock = className?.includes("language-");
		if (isBlock) {
			return (
				<code className="block overflow-x-auto rounded bg-background/50 p-2 font-mono text-[10px]">
					{children}
				</code>
			);
		}
		return (
			<code className="rounded bg-background/50 px-1 py-0.5 font-mono text-[10px]">{children}</code>
		);
	},
	pre: ({ children }) => <pre className="mb-1 last:mb-0">{children}</pre>,
	blockquote: ({ children }) => (
		<blockquote className="mb-1 border-l-2 border-border pl-2 italic last:mb-0">
			{children}
		</blockquote>
	),
	table: ({ children }) => (
		<div className="mb-1 overflow-x-auto last:mb-0">
			<table className="w-full border-collapse text-[10px]">{children}</table>
		</div>
	),
	th: ({ children }) => (
		<th className="border border-border/50 bg-background/50 px-1.5 py-0.5 text-left font-medium">
			{children}
		</th>
	),
	td: ({ children }) => <td className="border border-border/50 px-1.5 py-0.5">{children}</td>,
	a: ({ href, children }) => (
		<a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	),
	strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
	hr: () => <hr className="my-1 border-border/50" />,
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
