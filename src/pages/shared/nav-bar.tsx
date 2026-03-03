import { Link } from "react-router-dom";

export function NavBar() {
	return (
		<nav
			aria-label="Main"
			className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md"
		>
			<div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
				<Link
					to="/"
					className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
				>
					<img src="/logo_square.png" alt="Threat Forge" className="h-6 w-6" />
					<span className="text-lg font-semibold tracking-tight">Threat Forge</span>
				</Link>

				<div className="flex items-center gap-6">
					<Link
						to="/about"
						className="text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						About
					</Link>
					<Link
						to="/app"
						className="rounded-md bg-tf-signal px-4 py-2 text-sm font-medium text-tf-zero transition-opacity hover:opacity-90"
					>
						Try Online
					</Link>
				</div>
			</div>
		</nav>
	);
}
