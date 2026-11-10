import type { DocumentTypeId } from "../types";

/** Setup step 2, in the order the cards are shown. Title report stays the default. */
export const documentTypes: { id: DocumentTypeId; label: string }[] = [
	{ id: "commercial-lease", label: "Commercial Lease" },
	{ id: "environmental-assessments", label: "Environmental assessments" },
	{ id: "title-report", label: "Title report" },
];

const LABELS: Record<DocumentTypeId, string> = {
	"commercial-lease": "Commercial Lease",
	"environmental-assessments": "Environmental assessments",
	"title-report": "Title report",
};

/** The type stored on the document. Uploads stay a title report until a review says otherwise. */
export function documentTypeLabel(document: {
	document_type?: string | null;
}): string {
	const id = document.document_type;
	if (
		id === "commercial-lease" ||
		id === "environmental-assessments" ||
		id === "title-report"
	) {
		return LABELS[id];
	}
	return LABELS["title-report"];
}
