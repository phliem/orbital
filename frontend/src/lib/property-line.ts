export const PROPERTY_NOT_FOUND = "Not found in this document.";

/** The Property row. A renamed project title is not an input; only the extracted line is. */
export function displayedPropertyLine(
	reportLine: string | null | undefined,
	storedLine: string | null | undefined,
): string {
	const reportText = reportLine?.trim() ?? "";
	if (reportText && reportText !== PROPERTY_NOT_FOUND) return reportText;
	const storedText = storedLine?.trim() ?? "";
	if (storedText && storedText !== PROPERTY_NOT_FOUND) return storedText;
	return PROPERTY_NOT_FOUND;
}
