/** Accept the selected model or its provider's dated snapshot; reject silent substitution. */
export function verifyObservedModel(requested: string, observed: unknown): string {
	if (typeof observed !== "string") throw new Error("Provider smoke returned no model identity");
	const suffix = observed.slice(requested.length);
	const dated = requested.startsWith("claude-")
		? /^-\d{8}$/.test(suffix)
		: /^-\d{4}-\d{2}-\d{2}$/.test(suffix);
	if (observed !== requested && !(observed.startsWith(requested) && dated))
		throw new Error("Provider smoke returned a different model");
	return observed;
}
