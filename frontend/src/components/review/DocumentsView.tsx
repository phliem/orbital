import { FileText, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { documentTypeLabel } from "../../lib/document-type";
import type { Document } from "../../types";
import type { CitationJump } from "../DocumentViewer";
import { DocumentViewer } from "../DocumentViewer";
import { Button } from "../ui/button";
import { DocumentSwitcher, DocumentTypeSelect } from "./DocumentControls";

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kilobytes = Math.max(1, Math.round(bytes / 1024));
	if (kilobytes < 1024) return `${kilobytes} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsView({
	document,
	page,
	onPageChange,
	jump,
	error,
	onDelete,
}: {
	document: Document;
	page: number;
	onPageChange: (page: number) => void;
	jump: CitationJump | null;
	error: string | null;
	onDelete: (id: string) => Promise<string | null>;
}) {
	const [deleting, setDeleting] = useState(false);
	const size =
		document.size_bytes == null ? null : formatSize(document.size_bytes);

	const remove = async () => {
		setDeleting(true);
		try {
			await onDelete(document.id);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div className="flex min-h-0 flex-1">
			<div className="w-96 shrink-0 overflow-auto border-r border-border p-5">
				{error && (
					<div
						role="alert"
						className="mb-4 rounded-xl border border-high/40 bg-high-soft px-4 py-3 text-sm text-high"
					>
						{error}
					</div>
				)}
				<div className="flex flex-col items-start gap-3">
					<DocumentSwitcher name={document.filename} count={1} wide />
					<DocumentTypeSelect label={documentTypeLabel(document)} />
				</div>
				<ul className="mt-4 space-y-1">
					<li className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
						<FileText className="size-5 shrink-0 text-muted-foreground" />
						<button type="button" className="min-w-0 flex-1 text-left">
							<span className="block truncate text-sm font-medium">
								{document.filename}
							</span>
							{size && (
								<span className="block text-xs text-muted-foreground">
									{size}
								</span>
							)}
						</button>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
							aria-label={`Delete ${document.filename}`}
							disabled={deleting}
							onClick={() => void remove()}
						>
							<Trash2 />
						</Button>
					</li>
				</ul>
				<button
					type="button"
					disabled
					className="mt-3 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
				>
					<Upload className="size-4 shrink-0" />
					Add documents
					<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
						Coming soon
					</span>
				</button>
			</div>
			<div className="min-w-0 flex-1 p-5">
				<DocumentViewer
					document={document}
					page={page}
					onPageChange={onPageChange}
					jump={jump}
				/>
			</div>
		</div>
	);
}
