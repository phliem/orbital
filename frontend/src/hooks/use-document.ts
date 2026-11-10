import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import * as api from "../lib/api";
import type { Document } from "../types";

export function useDocument(conversationId: string | null) {
	const [loaded, setLoaded] = useState<{
		projectId: string;
		document: Document | null;
	} | null>(null);
	const document =
		loaded?.projectId === conversationId ? (loaded?.document ?? null) : null;
	const activeProject = useRef(conversationId);
	const revision = useRef(0);
	useLayoutEffect(() => {
		activeProject.current = conversationId;
		revision.current += 1;
		setError(null);
		setUploading(false);
	}, [conversationId]);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		if (!conversationId || activeProject.current !== conversationId) return;
		const request = ++revision.current;
		try {
			setError(null);
			const detail = await api.fetchConversation(conversationId);
			if (revision.current === request) {
				setLoaded({
					projectId: conversationId,
					document: detail.document ?? null,
				});
			}
		} catch (err) {
			if (revision.current === request) {
				setError(
					err instanceof Error ? err.message : "Failed to load document",
				);
			}
		}
	}, [conversationId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const upload = useCallback(
		async (file: File) => {
			if (!conversationId) return null;
			try {
				setUploading(true);
				setError(null);
				const doc = await api.uploadDocument(conversationId, file);
				if (activeProject.current === conversationId) {
					revision.current += 1;
					setLoaded({ projectId: conversationId, document: doc });
				}
				return doc;
			} catch (err) {
				if (activeProject.current === conversationId) {
					setError(
						err instanceof Error ? err.message : "Failed to upload document",
					);
				}
				return null;
			} finally {
				if (activeProject.current === conversationId) setUploading(false);
			}
		},
		[conversationId],
	);

	const remove = useCallback(
		async (documentId: string): Promise<string | null> => {
			try {
				setError(null);
				await api.deleteDocument(documentId);
				if (activeProject.current === conversationId) revision.current += 1;
				setLoaded((current) =>
					current?.document?.id === documentId
						? { ...current, document: null }
						: current,
				);
				return null;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to delete the document.";
				if (activeProject.current === conversationId) setError(message);
				return message;
			}
		},
		[conversationId],
	);

	return {
		document,
		uploading,
		error,
		upload,
		refresh,
		remove,
	};
}
