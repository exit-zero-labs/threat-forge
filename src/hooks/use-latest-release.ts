import { useEffect, useState } from "react";
import {
	detectOs,
	fetchLatestRelease,
	type LatestRelease,
	type OsType,
} from "@/lib/github-releases";

interface UseLatestReleaseResult {
	release: LatestRelease | null;
	detectedOs: OsType;
	isLoading: boolean;
	error: string | null;
}

/**
 * Fetches the latest GitHub release and detects the user's OS.
 */
export function useLatestRelease(): UseLatestReleaseResult {
	const [release, setRelease] = useState<LatestRelease | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [detectedOs] = useState(() => detectOs());

	useEffect(() => {
		let cancelled = false;

		fetchLatestRelease()
			.then((data) => {
				if (!cancelled) {
					setRelease(data);
					setIsLoading(false);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to fetch release");
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return { release, detectedOs, isLoading, error };
}
