import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { isTauri } from "./lib/platform";

const AppLayout = lazy(() =>
	import("./components/layout/app-layout").then((m) => ({ default: m.AppLayout })),
);
const LandingPage = lazy(() =>
	import("./pages/landing-page").then((m) => ({ default: m.LandingPage })),
);
const DownloadsPage = lazy(() =>
	import("./pages/downloads-page").then((m) => ({ default: m.DownloadsPage })),
);
const AboutPage = lazy(() => import("./pages/about-page").then((m) => ({ default: m.AboutPage })));
const PrivacyPage = lazy(() =>
	import("./pages/privacy-page").then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() => import("./pages/terms-page").then((m) => ({ default: m.TermsPage })));
const SupportPage = lazy(() =>
	import("./pages/support-page").then((m) => ({ default: m.SupportPage })),
);

export function App() {
	return (
		<BrowserRouter>
			<Suspense fallback={<LoadingFallback />}>
				<Routes>
					<Route path="/" element={isTauri() ? <Navigate to="/app" replace /> : <LandingPage />} />
					<Route path="/downloads" element={<DownloadsPage />} />
					<Route path="/about" element={<AboutPage />} />
					<Route path="/privacy" element={<PrivacyPage />} />
					<Route path="/terms" element={<TermsPage />} />
					<Route path="/support" element={<SupportPage />} />
					<Route path="/app" element={<AppLayout />} />
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</Suspense>
		</BrowserRouter>
	);
}

function LoadingFallback() {
	return (
		<div className="flex h-screen w-screen items-center justify-center bg-background">
			<output
				aria-label="Loading"
				className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
			/>
		</div>
	);
}
