import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import type { Message } from "../types";

interface MessageBubbleProps {
	message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
	if (message.role === "system") {
		return (
			<p className="py-2 text-center text-xs text-muted-foreground">
				{message.content}
			</p>
		);
	}

	if (message.role === "user") {
		return (
			<div className="flex justify-end py-1">
				<div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
					<p className="whitespace-pre-wrap">{message.content}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-start py-1">
			<div className="max-w-[85%] rounded-2xl border border-border bg-card px-4 py-2.5 text-sm">
				<div className="prose">
					<Streamdown>{message.content}</Streamdown>
				</div>
				{message.sources_cited > 0 && (
					<p className="mt-1.5 text-xs text-muted-foreground">
						{message.sources_cited} source
						{message.sources_cited !== 1 ? "s" : ""} cited
					</p>
				)}
			</div>
		</div>
	);
}

export function StreamingBubble({ content }: { content: string }) {
	return (
		<div className="flex justify-start py-1">
			<div className="max-w-[85%] rounded-2xl border border-border bg-card px-4 py-2.5 text-sm">
				{content ? (
					<div className="prose">
						<Streamdown mode="streaming">{content}</Streamdown>
					</div>
				) : (
					<div className="flex items-center gap-1 py-1">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
							style={{ animationDelay: "0.15s" }}
						/>
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
							style={{ animationDelay: "0.3s" }}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
