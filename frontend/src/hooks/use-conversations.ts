import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Conversation } from "../types";

export function useConversations() {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setError(null);
			const data = await api.fetchConversations();
			setConversations(data);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load conversations",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const create = useCallback(async () => {
		try {
			setError(null);
			const conversation = await api.createConversation();
			setConversations((prev) => [conversation, ...prev]);
			setSelectedId(conversation.id);
			return conversation;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create conversation",
			);
			return null;
		}
	}, []);

	const select = useCallback((id: string | null) => {
		setSelectedId(id);
	}, []);

	const rename = useCallback(async (id: string, title: string) => {
		try {
			const updated = await api.updateConversation(id, title);
			setConversations((prev) =>
				prev.map((item) =>
					item.id === id
						? {
								...item,
								title: updated.title,
								updated_at: updated.updated_at,
							}
						: item,
				),
			);
			return null;
		} catch (err) {
			return err instanceof Error
				? err.message
				: "Could not save the project title.";
		}
	}, []);

	const remove = useCallback(
		async (id: string): Promise<string | null> => {
			try {
				setError(null);
				await api.deleteConversation(id);
				const index = conversations.findIndex((item) => item.id === id);
				const remaining = conversations.filter((item) => item.id !== id);
				setConversations(remaining);
				if (selectedId === id) {
					setSelectedId(
						remaining[index]?.id ?? remaining[index - 1]?.id ?? null,
					);
				}
				return null;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to delete the project.";
				setError(message);
				return message;
			}
		},
		[conversations, selectedId],
	);

	const selected = conversations.find((c) => c.id === selectedId) ?? null;

	return {
		conversations,
		selected,
		selectedId,
		loading,
		error,
		create,
		select,
		rename,
		remove,
		refresh,
	};
}
