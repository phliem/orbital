export function addedChecksForRun(
	selection: Record<string, boolean>,
): { title: string; category: string }[] {
	return Object.entries(selection)
		.filter(([, on]) => on)
		.map(([title]) => ({ title, category: "Added by you" }));
}

/** Run stays off until at least one check is selected. */
export function canRunReport(selected: number): boolean {
	return selected > 0;
}
