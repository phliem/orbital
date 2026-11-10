import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Message } from "../types";
import { ChatInput } from "./ChatInput";
import { ErrorNotice } from "./ErrorNotice";
import { MessageBubble, StreamingBubble } from "./MessageBubble";
import { Button } from "./ui/button";

const suggestions = [
	"What are the biggest risks?",
	"Which easements are recorded?",
	"What security interests are on the title?",
];

interface ChatWindowProps {
	messages: Message[];
	loading: boolean;
	error: string | null;
	streaming: boolean;
	streamingContent: string;
	hasDocument: boolean;
	conversationId: string | null;
	onSend: (content: string) => void;
}

export function ChatWindow({
	messages,
	loading,
	error,
	streaming,
	streamingContent,
	hasDocument,
	conversationId,
	onSend,
}: ChatWindowProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const messagesLength = messages.length;

	// biome-ignore lint/correctness/useExhaustiveDependencies: streaming text should keep the latest reply in view
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messagesLength, streamingContent]);

	if (!conversationId) {
		return (
			<div className="grid flex-1 place-items-center text-sm text-muted-foreground">
				Select a project to ask about its document.
			</div>
		);
	}

	if (loading) {
		return (
			<div className="grid flex-1 place-items-center">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{error && (
				<div className="mx-auto mt-4 w-full max-w-2xl">
					<ErrorNotice message={error} title="Chat is unavailable." />
				</div>
			)}
			<div ref={scrollRef} className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-2xl space-y-4 p-6">
					{messages.length === 0 && !streaming && (
						<div className="py-12 text-center">
							<h2 className="text-2xl font-semibold tracking-tight">
								Ask about this project
							</h2>
							<p className="mt-2 text-sm text-muted-foreground">
								{hasDocument
									? "Answers use the PDF uploaded on this project."
									: "Upload a PDF on the Analysis tab, then ask about it here."}
							</p>
							{hasDocument && (
								<div className="mt-5 flex flex-wrap justify-center gap-2">
									{suggestions.map((suggestion) => (
										<Button
											key={suggestion}
											variant="outline"
											size="sm"
											onClick={() => onSend(suggestion)}
										>
											{suggestion}
										</Button>
									))}
								</div>
							)}
						</div>
					)}
					{messages.map((message) => (
						<MessageBubble key={message.id} message={message} />
					))}
					{streaming && <StreamingBubble content={streamingContent} />}
				</div>
			</div>
			<ChatInput onSend={onSend} disabled={streaming} />
		</div>
	);
}
