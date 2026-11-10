import type {
	ClientId,
	Conversation,
	ConversationDetail,
	Document,
	DocumentTypeId,
	Message,
	TitleChecklistReport,
} from "../types";
import type { PersonaCatalog } from "./clients";

const BASE = "/api";

async function errorMessage(response: Response): Promise<string> {
	const text = await response.text().catch(() => "");
	try {
		const data = JSON.parse(text) as {
			message?: unknown;
			detail?: unknown;
		};
		if (typeof data.message === "string") return data.message;
		if (typeof data.detail === "string") return data.detail;
		if (data.detail && typeof data.detail === "object") {
			const detail = data.detail as { message?: unknown; error?: unknown };
			if (typeof detail.message === "string") return detail.message;
			if (typeof detail.error === "string") return detail.error;
		}
	} catch {
		// The body was not JSON.
	}
	return text || `Request failed (${response.status})`;
}

async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		throw new Error(await errorMessage(response));
	}
	return response.json() as Promise<T>;
}

export async function fetchConversations(): Promise<Conversation[]> {
	const res = await fetch(`${BASE}/conversations`);
	return handleResponse<Conversation[]>(res);
}

export async function createConversation(): Promise<Conversation> {
	const res = await fetch(`${BASE}/conversations`, { method: "POST" });
	return handleResponse<Conversation>(res);
}

export async function updateConversation(
	id: string,
	title: string,
): Promise<Conversation> {
	const res = await fetch(`${BASE}/conversations/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ title }),
	});
	return handleResponse<Conversation>(res);
}

export async function deleteConversation(id: string): Promise<void> {
	const res = await fetch(`${BASE}/conversations/${id}`, {
		method: "DELETE",
	});
	if (!res.ok) {
		throw new Error(await errorMessage(res));
	}
}

export async function fetchConversation(
	id: string,
): Promise<ConversationDetail> {
	const res = await fetch(`${BASE}/conversations/${id}`);
	return handleResponse<ConversationDetail>(res);
}

export async function fetchMessages(
	conversationId: string,
	signal?: AbortSignal,
): Promise<Message[]> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
		signal,
	});
	return handleResponse<Message[]>(res);
}

export async function sendMessage(
	conversationId: string,
	content: string,
	signal?: AbortSignal,
): Promise<Response> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
		signal,
	});
	if (!res.ok) {
		throw new Error(await errorMessage(res));
	}
	return res;
}

export async function uploadDocument(
	conversationId: string,
	file: File,
): Promise<Document> {
	const formData = new FormData();
	formData.append("file", file);
	const res = await fetch(`${BASE}/conversations/${conversationId}/documents`, {
		method: "POST",
		body: formData,
	});
	return handleResponse<Document>(res);
}

export function getDocumentUrl(documentId: string): string {
	return `${BASE}/documents/${documentId}/content`;
}

export async function deleteDocument(id: string): Promise<void> {
	const res = await fetch(`${BASE}/documents/${id}`, { method: "DELETE" });
	if (!res.ok) {
		throw new Error(await errorMessage(res));
	}
}

export async function fetchPersonas(): Promise<PersonaCatalog> {
	const res = await fetch(`${BASE}/personas`);
	return handleResponse<PersonaCatalog>(res);
}

export async function fetchTitleChecklist(
	conversationId: string,
): Promise<TitleChecklistReport | null> {
	const res = await fetch(
		`${BASE}/conversations/${conversationId}/title-checklist`,
	);
	if (res.status === 404) return null;
	return handleResponse<TitleChecklistReport>(res);
}

export async function runTitleChecklist(
	conversationId: string,
	clientId: ClientId,
	checks: { title: string; category: string }[],
	simulateFailure = false,
	documentType: DocumentTypeId = "title-report",
): Promise<TitleChecklistReport> {
	const res = await fetch(
		`${BASE}/conversations/${conversationId}/title-checklist`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: clientId,
				simulate_failure: simulateFailure,
				checks,
				document_type: documentType,
			}),
		},
	);
	return handleResponse<TitleChecklistReport>(res);
}

export async function updateResolution(
	conversationId: string,
	reviewId: string,
	checkId: string,
	resolved: boolean,
): Promise<TitleChecklistReport> {
	const response = await fetch(
		`${BASE}/conversations/${conversationId}/title-checklist/resolution`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				review_id: reviewId,
				check_id: checkId,
				resolved,
			}),
		},
	);
	return handleResponse<TitleChecklistReport>(response);
}
