import type { ClientId } from "../types";

export interface ClientProfile {
	id: ClientId;
	short: string;
	name: string;
	initials: string;
	persona: string;
	contact: string;
	to: string;
	cta: string;
}

export const clients: ClientProfile[] = [
	{
		id: "willowbank",
		short: "Willowbank",
		name: "Willowbank Homes LLC",
		initials: "MC",
		persona: "Residential Developer",
		contact: "Maya Chen · VP of Acquisitions",
		to: "Maya Chen, VP of Acquisitions, Willowbank Homes LLC",
		cta: "Willow bank",
	},
	{
		id: "northstar",
		short: "Northstar",
		name: "Northstar Burger Co.",
		initials: "DO",
		persona: "Commercial Tenant",
		contact: "Daniel Okonkwo · Head of Real Estate",
		to: "Daniel Okonkwo, Head of Real Estate, Northstar Burger Co.",
		cta: "Northstar",
	},
];

export function clientById(id: string | null): ClientProfile | null {
	return clients.find((client) => client.id === id) ?? null;
}

export interface SetupGroup {
	category: string;
	titles: string[];
}

/** Display copy of backend/config/personas.yaml. The API replaces this after load. */
export const setupGroups: Record<ClientId, SetupGroup[]> = {
	willowbank: [
		{
			category: "Included in this review",
			titles: [
				"Height and massing",
				"Easements over the buildable area",
				"Monetary encumbrances",
				"Use restrictions",
				"Access",
			],
		},
	],
	northstar: [
		{
			category: "Included in this review",
			titles: [
				"Permitted use and use restrictions",
				"Easements across the premises",
				"Access and shared drives",
				"Security interests and occupation",
				"Building limits",
			],
		},
	],
};

export interface PersonaCatalog {
	clients: {
		id: ClientId;
		persona_id: string;
		persona_name: string;
		groups: SetupGroup[];
	}[];
}

export function groupsFromCatalog(
	catalog: PersonaCatalog,
): Record<ClientId, SetupGroup[]> {
	const next: Record<ClientId, SetupGroup[]> = {
		willowbank: setupGroups.willowbank,
		northstar: setupGroups.northstar,
	};
	for (const client of catalog.clients) {
		if (client.id === "willowbank" || client.id === "northstar") {
			next[client.id] = client.groups;
		}
	}
	return next;
}

export function personaNamesFromCatalog(
	catalog: PersonaCatalog,
): Record<ClientId, string> {
	const names: Record<ClientId, string> = {
		willowbank: "Residential Developer",
		northstar: "Commercial Tenant",
	};
	for (const client of catalog.clients) {
		if (client.id === "willowbank" || client.id === "northstar") {
			names[client.id] = client.persona_name;
		}
	}
	return names;
}

export type CheckSelection = Record<string, boolean>;

export function groupTitles(groups: readonly SetupGroup[]): string[] {
	return groups.flatMap((group) => group.titles);
}

export function defaultCheckSelection(
	groups: Record<ClientId, SetupGroup[]> = setupGroups,
	previous?: Record<ClientId, CheckSelection>,
): Record<ClientId, CheckSelection> {
	const selection = (clientId: ClientId): CheckSelection =>
		Object.fromEntries(
			groupTitles(groups[clientId]).map((title) => [
				title,
				previous?.[clientId]?.[title] ?? true,
			]),
		);
	return {
		willowbank: selection("willowbank"),
		northstar: selection("northstar"),
	};
}

export function selectedCount(selection: CheckSelection): number {
	return Object.values(selection).filter(Boolean).length;
}

export function selectedChecks(
	clientId: ClientId,
	selection: CheckSelection,
	groups: Record<ClientId, SetupGroup[]> = setupGroups,
): { title: string; category: string }[] {
	return groups[clientId].flatMap((group) =>
		group.titles
			.filter((title) => selection[title])
			.map((title) => ({ title, category: group.category })),
	);
}

export function selectionFromReport(
	clientId: ClientId,
	current: CheckSelection,
	titlesInReport: string[],
	groups: Record<ClientId, SetupGroup[]> = setupGroups,
	requested?: readonly { title: string }[] | null,
): CheckSelection {
	const present = new Set(
		requested ? requested.map((check) => check.title) : titlesInReport,
	);
	const next = { ...current };
	for (const title of groupTitles(groups[clientId])) {
		next[title] = present.has(title);
	}
	return next;
}
