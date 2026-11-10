import { useCallback, useLayoutEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type { Message } from "../types";

export function useMessages(
	conversationId: string | null,
	documentId: string | null,
) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [streaming, setStreaming] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const abortRef = useRef<AbortController | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new upload starts a new chat
	useLayoutEffect(() => {
		const controller = new AbortController();
		abortRef.current = controller;
		setMessages([]);
		setError(null);
		setStreaming(false);
		setStreamingContent("");
		setLoading(Boolean(conversationId));
		if (conversationId) {
			api
				.fetchMessages(conversationId, controller.signal)
				.then((data) => {
					if (!controller.signal.aborted) setMessages(data);
				})
				.catch((err: unknown) => {
					if (!controller.signal.aborted) {
						setError(
							err instanceof Error ? err.message : "Failed to load messages",
						);
					}
				})
				.finally(() => {
					if (!controller.signal.aborted) setLoading(false);
				});
		}
		return () => controller.abort();
	}, [conversationId, documentId]);

	const send = useCallback(
		async (content: string) => {
			const signal = abortRef.current?.signal;
			if (!conversationId || !signal || signal.aborted || streaming || loading)
				return;

			const userMessage: Message = {
				id: `temp-${Date.now()}`,
				conversation_id: conversationId,
				role: "user",
				content,
				sources_cited: 0,
				created_at: new Date().toISOString(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setStreaming(true);
			setStreamingContent("");
			setError(null);

			try {
				const response = await api.sendMessage(conversationId, content, signal);

				if (!response.body) {
					throw new Error("No response body");
				}

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let accumulated = "";
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (signal.aborted) return;
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					// Keep the last potentially incomplete line in the buffer
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed || !trimmed.startsWith("data: ")) continue;

						const data = trimmed.slice(6);
						if (data === "[DONE]") continue;

						try {
							const parsed = JSON.parse(data) as {
								type?: string;
								content?: string;
								delta?: string;
								message?: Message;
							};

							if (parsed.type === "delta" && parsed.delta) {
								accumulated += parsed.delta;
								setStreamingContent(accumulated);
							} else if (parsed.type === "content" && parsed.content) {
								accumulated += parsed.content;
								setStreamingContent(accumulated);
							} else if (parsed.type === "message" && parsed.message) {
								// Final message from server
								setMessages((prev) => [...prev, parsed.message as Message]);
								accumulated = "";
							} else if (parsed.content && !parsed.type) {
								// Fallback: plain content field
								accumulated += parsed.content;
								setStreamingContent(accumulated);
							}
						} catch {
							// Skip invalid JSON lines
						}
					}
				}

				// If we accumulated content but never got a final message,
				// create a synthetic assistant message
				if (accumulated) {
					const assistantMessage: Message = {
						id: `stream-${Date.now()}`,
						conversation_id: conversationId,
						role: "assistant",
						content: accumulated,
						sources_cited: 0,
						created_at: new Date().toISOString(),
					};
					setMessages((prev) => [...prev, assistantMessage]);
				}

				// Refresh to get server-canonical messages
				const freshMessages = await api.fetchMessages(conversationId, signal);
				if (!signal.aborted) setMessages(freshMessages);
			} catch (err) {
				if (signal.aborted) return;
				setMessages((prev) =>
					prev.filter((message) => message.id !== userMessage.id),
				);
				setError(err instanceof Error ? err.message : "Failed to send message");
			} finally {
				if (!signal.aborted) {
					setStreaming(false);
					setStreamingContent("");
				}
			}
		},
		[conversationId, streaming, loading],
	);

	return {
		messages,
		loading,
		error,
		streaming,
		streamingContent,
		send,
	};
}
