export const projectSections = [
	{ id: "analysis", label: "Analysis" },
	{ id: "chat", label: "Chat" },
	{ id: "documents", label: "Documents" },
	{ id: "manage", label: "Manage project" },
] as const;

export type SectionId = (typeof projectSections)[number]["id"];

export const defaultSection: SectionId = projectSections[0].id;
