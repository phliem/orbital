export interface ReviewCheckGroup {
	category: string;
	titles: readonly string[];
}

export interface ReviewCheckRow {
	title: string;
	category: string;
	analysed: boolean;
	status: "Analysed" | "Not analysed";
	/** Rows are plain list items, never checkboxes. */
	role: null;
}

/** Titles sent with this report. Older reports only recorded the findings. */
export function sentTitlesForReport(
	groups: readonly ReviewCheckGroup[],
	findingTitles: readonly string[],
	report: {
		items: { title: string }[];
		requested_checks?: { title: string }[] | null;
	},
): string[] {
	if (report.requested_checks) {
		return report.requested_checks.map((check) => check.title);
	}
	const findings = new Set(findingTitles);
	const present = new Set(report.items.map((item) => item.title));
	return groups
		.flatMap((group) => group.titles)
		.filter((title) => !findings.has(title) || present.has(title));
}

export function reviewCheckRows(
	groups: readonly ReviewCheckGroup[],
	sentTitles: readonly string[],
): ReviewCheckRow[] {
	const sent = new Set(sentTitles);
	return groups.flatMap((group) =>
		group.titles.map((title) => {
			const analysed = sent.has(title);
			return {
				title,
				category: group.category,
				analysed,
				status: analysed ? "Analysed" : "Not analysed",
				role: null,
			};
		}),
	);
}

export function analysedCountLabel(
	rows: readonly { analysed: boolean }[],
): string {
	const analysed = rows.filter((row) => row.analysed).length;
	return `${analysed} of ${rows.length} analysed`;
}

function analysedRow(title: string, category: string): ReviewCheckRow {
	return {
		title,
		category: category || "Added by you",
		analysed: true,
		status: "Analysed",
		role: null,
	};
}

/** Persona rows for a title report, or the checks sent for a commercial lease or environmental assessment. */
export function rowsForReport(
	personaGroups: readonly ReviewCheckGroup[],
	findingTitles: readonly string[],
	report: {
		items: { title: string }[];
		requested_checks?: { title: string; category?: string }[] | null;
		document_type?: string | null;
	},
): ReviewCheckRow[] {
	const type = report.document_type || "title-report";
	if (type !== "title-report") {
		const sent = report.requested_checks?.length
			? report.requested_checks
			: report.items.map((item) => ({
					title: item.title,
					category: "Added by you",
				}));
		return sent.map((check) =>
			analysedRow(check.title, check.category || "Added by you"),
		);
	}
	const known = new Set(personaGroups.flatMap((group) => group.titles));
	const stored = report.requested_checks?.length
		? report.requested_checks
		: report.items.map((item) => ({
				title: item.title,
				category: "This review",
			}));
	const overlaps =
		stored.some((check) => known.has(check.title)) ||
		report.items.some((item) => known.has(item.title));
	if (!overlaps && stored.length > 0) {
		const seen = new Set<string>();
		const legacy: ReviewCheckRow[] = [];
		for (const check of stored) {
			if (!check.title || seen.has(check.title)) continue;
			seen.add(check.title);
			legacy.push(analysedRow(check.title, check.category || "This review"));
		}
		return legacy;
	}
	const sent = sentTitlesForReport(personaGroups, findingTitles, report);
	const rows = reviewCheckRows(personaGroups, sent);
	const shown = new Set(rows.map((row) => row.title));
	const extras = (report.requested_checks ?? [])
		.filter((check) => !shown.has(check.title))
		.map((check) => analysedRow(check.title, check.category || "Added by you"));
	return [...rows, ...extras];
}
