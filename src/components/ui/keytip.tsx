/**
 * Keytip — a small badge showing a keyboard shortcut near a control.
 * Positioned absolutely, so the parent should be `relative`.
 */
export function Keytip({ shortcut }: { shortcut: string }) {
	return (
		<span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 rounded border border-border bg-muted px-1 font-mono text-[8px] leading-tight text-muted-foreground whitespace-nowrap">
			{shortcut}
		</span>
	);
}
