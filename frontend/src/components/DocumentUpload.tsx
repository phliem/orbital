import { Loader2, Upload } from "lucide-react";
import { type DragEvent, useCallback, useRef, useState } from "react";

interface DocumentUploadProps {
	onUpload: (file: File) => void;
	uploading?: boolean;
}

export function DocumentUpload({
	onUpload,
	uploading = false,
}: DocumentUploadProps) {
	const [dragOver, setDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDragOver = useCallback((e: DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file && file.type === "application/pdf") {
				onUpload(file);
			}
		},
		[onUpload],
	);

	const handleClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				onUpload(file);
			}
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		},
		[onUpload],
	);

	return (
		<button
			type="button"
			className={`flex h-auto w-full cursor-pointer flex-col items-center rounded-xl border-2 border-dashed bg-card px-12 py-14 text-center transition ${
				dragOver
					? "border-primary/40 bg-muted"
					: "border-border hover:border-primary/40"
			}`}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			onClick={handleClick}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".pdf"
				className="hidden"
				onChange={handleFileChange}
			/>

			{uploading ? (
				<div className="flex flex-col items-center">
					<Loader2 className="size-9 animate-spin text-muted-foreground" />
					<p className="mt-4 text-lg font-semibold">Uploading document...</p>
				</div>
			) : (
				<div className="flex flex-col items-center">
					<Upload className="size-9 text-muted-foreground" />
					<div className="mt-4 text-lg font-semibold">
						Upload a PDF document
					</div>
					<div className="mt-1 text-sm text-muted-foreground">
						Click or drag and drop
					</div>
				</div>
			)}
		</button>
	);
}
