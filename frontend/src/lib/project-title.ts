export const PROJECT_TITLE_MAX = 120;

/** The title to persist, or null when the draft is blank or unchanged. */
export function nextProjectTitle(
	current: string,
	draft: string,
): string | null {
	const trimmed = draft.trim();
	if (
		!trimmed ||
		trimmed.length > PROJECT_TITLE_MAX ||
		trimmed === current.trim()
	) {
		return null;
	}
	return trimmed;
}
