export interface Conversation {
	id: string;
	title: string;
	property_line?: string | null;
	created_at: string;
	updated_at: string;
	has_document: boolean;
}

export interface Message {
	id: string;
	conversation_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	sources_cited: number;
	created_at: string;
}

export type DocumentTypeId =
	| "commercial-lease"
	| "environmental-assessments"
	| "title-report";

export interface Document {
	id: string;
	conversation_id: string;
	filename: string;
	page_count: number;
	document_type?: DocumentTypeId | null;
	uploaded_at: string;
	size_bytes?: number | null;
}

export interface ConversationDetail extends Conversation {
	document?: Document;
}

export type CheckId = string;

export type Risk = "issue" | "needs_evidence" | "low_priority";
export type Severity = Risk | "not_found";
export type CheckStatus = "found" | "not_found" | "needs_evidence";
export type ClientId = "willowbank" | "northstar";

export interface Assessment {
	risk: Risk;
	summary: string;
	recommendation: string;
	unresolved_note: string | null;
}

export interface Citation {
	page: number | null;
	clause: string | null;
	excerpt: string | null;
	verified: boolean;
}

export interface ChecklistItem {
	check_id: string;
	parent_id?: string;
	title: string;
	short_title: string;
	clause: string;
	status: CheckStatus;
	document_says: string;
	citation: Citation;
	burden?: "burden" | "benefit" | "both" | null;
	assessments: Partial<Record<ClientId, Assessment>>;
}

export interface TitleChecklistReport {
	review_id?: string | null;
	resolved_ids?: string[];
	conversation_id: string;
	client_id: ClientId;
	source: "model" | "recorded";
	document_type?: DocumentTypeId | null;
	persona_id?: string | null;
	property_line: string | null;
	requested_checks?: { title: string; category: string }[] | null;
	items: ChecklistItem[];
}
