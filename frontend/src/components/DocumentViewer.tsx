import {
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
	Search,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import {
	countMatches,
	firstMatchPage,
	markExcerpt,
	markQuery,
	pageTextFromItems,
} from "../lib/highlight";
import type { Document } from "../types";
import { Button } from "./ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

export interface CitationJump {
	page: number;
	excerpt: string;
	clause: string;
	nonce: number;
}

interface DocumentViewerProps {
	document: Document | null;
	page: number;
	onPageChange: (page: number) => void;
	jump: CitationJump | null;
}

export function DocumentViewer({
	document,
	page,
	onPageChange,
	jump,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState(0);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [zoom, setZoom] = useState(100);
	const [pageWidth, setPageWidth] = useState(520);
	const [pageTexts, setPageTexts] = useState<string[]>([]);
	const [searchOpen, setSearchOpen] = useState(false);
	const [query, setQuery] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const documentId = document?.id ?? null;

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const measure = () => setPageWidth(Math.max(280, el.clientWidth - 64));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// documentId is the reset key when the open PDF changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset search for the next document
	useEffect(() => {
		setPageTexts([]);
		setNumPages(0);
		setQuery("");
		setSearchOpen(false);
	}, [documentId]);

	const paint = useCallback(
		(scrollSearch: boolean) => {
			const root = scrollRef.current;
			if (!root) return;
			if (jump && jump.page === page) markExcerpt(root, jump.excerpt);
			markQuery(root, searchOpen ? query.trim() : "", scrollSearch);
		},
		[jump, page, query, searchOpen],
	);

	useEffect(() => {
		paint(true);
		const early = window.setTimeout(() => paint(false), 300);
		const later = window.setTimeout(() => paint(false), 900);
		return () => {
			window.clearTimeout(early);
			window.clearTimeout(later);
		};
	}, [paint]);

	const trimmed = query.trim();
	const matches = searchOpen ? countMatches(pageTexts, trimmed) : 0;

	useEffect(() => {
		if (!searchOpen || !trimmed || pageTexts.length === 0) return;
		const next = firstMatchPage(pageTexts, trimmed);
		if (next) onPageChange(next);
	}, [pageTexts, searchOpen, trimmed, onPageChange]);

	useEffect(() => {
		if (searchOpen) searchRef.current?.focus();
	}, [searchOpen]);

	const onSearch = (value: string) => {
		setQuery(value);
		const next = firstMatchPage(pageTexts, value);
		if (next) onPageChange(next);
	};

	if (!document) {
		return (
			<div className="flex h-full min-w-0 flex-1 items-center justify-center rounded-xl border border-border bg-muted/50 text-sm text-muted-foreground">
				No document uploaded
			</div>
		);
	}

	const safePage = numPages > 0 ? Math.min(page, numPages) : page;
	const showJump = jump && jump.page === safePage;

	return (
		<div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-muted/50">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-card px-4 py-2 text-sm">
				<FileText className="size-4 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate text-muted-foreground">
					{document.filename}
				</span>
				<div className="ml-auto flex flex-wrap items-center justify-end gap-1">
					<Button
						size="icon"
						variant="outline"
						className="size-8"
						disabled={safePage <= 1}
						onClick={() => onPageChange(Math.max(1, safePage - 1))}
						aria-label="Previous page"
					>
						<ChevronLeft />
					</Button>
					<span className="whitespace-nowrap px-2">
						Page {safePage} of {numPages || document.page_count || "–"}
					</span>
					<Button
						size="icon"
						variant="outline"
						className="size-8"
						disabled={numPages > 0 && safePage >= numPages}
						onClick={() => onPageChange(safePage + 1)}
						aria-label="Next page"
					>
						<ChevronRight />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						className="ml-2 size-8"
						onClick={() => setZoom((value) => Math.max(70, value - 10))}
						aria-label="Zoom out"
					>
						<ZoomOut />
					</Button>
					<span className="w-12 text-center text-muted-foreground">
						{zoom}%
					</span>
					<Button
						size="icon"
						variant="ghost"
						className="size-8"
						onClick={() => setZoom((value) => Math.min(150, value + 10))}
						aria-label="Zoom in"
					>
						<ZoomIn />
					</Button>
					{searchOpen && (
						<span className="flex items-center gap-1.5">
							<input
								ref={searchRef}
								value={query}
								onChange={(event) => onSearch(event.target.value)}
								placeholder="Search document…"
								aria-label="Search document"
								className="h-8 w-44 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
							/>
							{trimmed && (
								<span className="whitespace-nowrap text-xs text-muted-foreground">
									{matches} match{matches === 1 ? "" : "es"}
								</span>
							)}
						</span>
					)}
					<Button
						size="icon"
						variant={searchOpen ? "secondary" : "ghost"}
						className="size-8"
						aria-label="Search document"
						aria-pressed={searchOpen}
						onClick={() => {
							setSearchOpen((open) => !open);
							if (searchOpen) setQuery("");
						}}
					>
						<Search />
					</Button>
				</div>
			</div>
			{showJump && (
				<div className="evidence-flash border-b border-border bg-mark px-3 py-1.5 text-center font-sans text-xs font-medium text-foreground">
					{jump.clause}
				</div>
			)}
			<div ref={scrollRef} className="flex-1 overflow-auto px-6 py-4">
				{pdfError && (
					<div
						className="mb-3 rounded-lg bg-high-soft p-3 text-sm text-high"
						role="alert"
					>
						{pdfError}
					</div>
				)}
				<PDFDocument
					file={getDocumentUrl(document.id)}
					onLoadSuccess={(pdf) => {
						setNumPages(pdf.numPages);
						setPdfError(null);
						void readPageTexts(pdf).then(setPageTexts);
					}}
					onLoadError={(error) =>
						setPdfError(`Failed to load PDF: ${error.message}`)
					}
					loading={
						<div className="flex items-center justify-center py-12">
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						</div>
					}
				>
					<Page
						pageNumber={safePage}
						width={pageWidth * (zoom / 100)}
						onRenderTextLayerSuccess={() => paint(false)}
						loading={
							<div className="flex items-center justify-center py-12">
								<Loader2 className="size-5 animate-spin text-muted-foreground" />
							</div>
						}
					/>
				</PDFDocument>
			</div>
		</div>
	);
}

async function readPageTexts(pdf: {
	numPages: number;
	getPage: (page: number) => Promise<{
		getTextContent: () => Promise<{ items: readonly unknown[] }>;
	}>;
}): Promise<string[]> {
	const texts: string[] = [];
	for (let number = 1; number <= pdf.numPages; number++) {
		const pdfPage = await pdf.getPage(number);
		const content = await pdfPage.getTextContent();
		const items = content.items.flatMap((item) => {
			if (
				typeof item === "object" &&
				item !== null &&
				"str" in item &&
				typeof item.str === "string"
			) {
				return [{ str: item.str }];
			}
			return [];
		});
		texts.push(pageTextFromItems(items));
	}
	return texts;
}
