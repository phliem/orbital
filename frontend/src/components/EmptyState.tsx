import { FileSearch } from "lucide-react";
import { DocumentUpload } from "./DocumentUpload";

interface EmptyStateProps {
	onUpload: (file: File) => void;
	uploading?: boolean;
	error?: string | null;
}

export function EmptyState({ onUpload, uploading, error }: EmptyStateProps) {
	return (
		<div className="grid flex-1 place-items-center p-8">
			<div className="flex w-full max-w-lg flex-col items-center text-center">
				<div className="grid size-20 place-items-center rounded-2xl bg-foreground text-background">
					<FileSearch className="size-9" />
				</div>
				<h2 className="mt-8 text-2xl font-bold tracking-tight">
					Upload a document to get started
				</h2>
				<p className="mt-3 max-w-md text-base text-muted-foreground">
					Upload one PDF. The review can be a title report, a commercial lease,
					or an environmental assessment.
				</p>
				<div className="mt-10 w-full">
					<DocumentUpload onUpload={onUpload} uploading={uploading} />
				</div>
				{error && (
					<div
						role="alert"
						className="mt-4 w-full rounded-xl border border-high/40 bg-high-soft px-4 py-3 text-left text-sm text-high"
					>
						{error}
					</div>
				)}
			</div>
		</div>
	);
}
