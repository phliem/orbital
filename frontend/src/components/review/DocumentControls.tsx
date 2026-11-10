import { Check, ChevronDown, FileText, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export function DocumentSwitcher({
	name,
	count,
	wide = false,
}: {
	name: string;
	count: number;
	wide?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const close = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		window.addEventListener("mousedown", close);
		return () => window.removeEventListener("mousedown", close);
	}, [open]);

	return (
		<div ref={rootRef} className={cn("relative", wide && "w-full")}>
			<button
				type="button"
				aria-expanded={open}
				aria-label="Project documents"
				onClick={() => setOpen((value) => !value)}
				className={cn(
					"group flex max-w-xl items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted",
					wide ? "w-full" : "-mx-2",
				)}
			>
				<FileText className="size-5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1">
					<span className="block text-xs font-medium uppercase tracking-widest text-muted-foreground">
						Document · {count} uploaded
					</span>
					<span className="block truncate text-xl font-semibold tracking-tight">
						{name}
					</span>
				</span>
				<ChevronDown
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>
			{open && (
				<div className="absolute z-20 mt-1 w-80 rounded-md border border-border bg-card p-1 shadow-md">
					<div className="px-2 py-1.5 text-sm font-medium">
						Project documents
					</div>
					<div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
						<FileText className="size-4 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate">{name}</span>
						<Check className="size-4 shrink-0" />
					</div>
					<div className="my-1 h-px bg-border" />
					<button
						type="button"
						disabled
						className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground"
					>
						<Upload className="size-4 shrink-0" /> Add documents
						<span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
							Coming soon
						</span>
					</button>
				</div>
			)}
		</div>
	);
}

export function DocumentTypeSelect({ label }: { label: string }) {
	return (
		<div
			aria-label="Document type"
			className="flex h-9 w-44 items-center rounded-md border border-border bg-background px-3 text-sm shadow-sm"
		>
			{label}
		</div>
	);
}
