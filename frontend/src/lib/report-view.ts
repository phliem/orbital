import type {
	Assessment,
	ChecklistItem,
	ClientId,
	Risk,
	Severity,
} from "../types";

export const riskLabel: Record<Severity, string> = {
	issue: "Issue",
	needs_evidence: "Needs evidence",
	low_priority: "Low priority",
	not_found: "Not found",
};

export const severityOrder: Severity[] = [
	"issue",
	"needs_evidence",
	"low_priority",
	"not_found",
];

export type StatusFilter = "flagged" | "resolved" | null;

export function assessmentFor(
	item: ChecklistItem,
	clientId: ClientId,
): Assessment | undefined {
	return item.assessments[clientId] ?? undefined;
}

export function severityOf(item: ChecklistItem, clientId: ClientId): Severity {
	if (item.status === "not_found") return "not_found";
	return assessmentFor(item, clientId)?.risk ?? "needs_evidence";
}

export interface FindingGroup {
	key: string;
	label: string;
	items: ChecklistItem[];
}

/** Cards that share a custom check or category stay together, in report order. */
export function groupFindings(items: readonly ChecklistItem[]): FindingGroup[] {
	const groups: FindingGroup[] = [];
	for (const item of items) {
		const key = item.parent_id || item.check_id;
		const last = groups[groups.length - 1];
		if (last && last.key === key) last.items.push(item);
		else groups.push({ key, label: item.title, items: [item] });
	}
	return groups;
}

export function findingRisk(item: ChecklistItem, clientId: ClientId): Risk {
	const severity = severityOf(item, clientId);
	return severity === "not_found" ? "needs_evidence" : severity;
}

/** Flagged and Resolved narrow the list. All (a null status) keeps every finding. */
export function applyStatus(
	items: readonly ChecklistItem[],
	followUps: readonly string[],
	resolved: readonly string[],
	status: StatusFilter,
): ChecklistItem[] {
	if (status === "resolved") {
		return items.filter((item) => resolved.includes(item.check_id));
	}
	if (status === "flagged") {
		return items.filter((item) => followUps.includes(item.check_id));
	}
	return [...items];
}

/** All clears severity and the Flagged / Resolved status filter together. */
export function selectAll(): { filter: Severity[]; status: StatusFilter } {
	return { filter: [], status: null };
}

export function allIsSelected(
	filter: readonly Severity[],
	status: StatusFilter,
): boolean {
	return filter.length === 0 && status === null;
}

/** Resolved stays labeled Resolved. Pressed matches the filled Follow-up treatment. */
export function resolvedButtonState(resolved: boolean): {
	pressed: boolean;
	filled: boolean;
	label: "Resolved";
} {
	return {
		pressed: resolved,
		filled: resolved,
		label: "Resolved",
	};
}

export function visibleFindings(
	items: readonly ChecklistItem[],
	clientId: ClientId,
	filter: readonly Severity[],
	followUps: readonly string[] = [],
	resolved: readonly string[] = [],
	status: StatusFilter = null,
): ChecklistItem[] {
	const scoped = applyStatus(items, followUps, resolved, status);
	if (filter.length === 0) return scoped;
	return scoped.filter((item) => filter.includes(severityOf(item, clientId)));
}

export function countRisk(
	items: readonly ChecklistItem[],
	clientId: ClientId,
	risk: Severity,
): number {
	return items.filter((item) => severityOf(item, clientId) === risk).length;
}

export function countMarked(
	items: readonly ChecklistItem[],
	ids: readonly string[],
): number {
	const marked = new Set(ids);
	return items.filter((item) => marked.has(item.check_id)).length;
}
