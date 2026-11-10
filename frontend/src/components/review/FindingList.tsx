import { CircleCheck, Flag, Link2 } from "lucide-react";
import {
	type StatusFilter,
	assessmentFor,
	countMarked,
	groupFindings,
	resolvedButtonState,
	riskLabel,
	severityOf,
	visibleFindings,
} from "../../lib/report-view";
import { severityAccent } from "../../lib/severity-style";
import { cn } from "../../lib/utils";
import type { ChecklistItem, ClientId, Severity } from "../../types";
import { Button } from "../ui/button";

const riskChip: Record<Severity, string> = {
	issue: "border-high/40 bg-high-soft text-high",
	needs_evidence: "border-evidence/40 bg-evidence-soft text-evidence",
	low_priority: "border-low/40 bg-low-soft text-low",
	not_found: "border-border bg-muted text-muted-foreground",
};
const riskBorder: Record<Severity, string> = {
	issue: "border-high/40",
	needs_evidence: "border-evidence/40",
	low_priority: "border-low/40",
	not_found: "border-border",
};
const riskBorderStrong: Record<Severity, string> = {
	issue: "border-high ring-1 ring-high/30",
	needs_evidence: "border-evidence ring-1 ring-evidence/30",
	low_priority: "border-low ring-1 ring-low/30",
	not_found: "border-muted-foreground/60 ring-1 ring-muted-foreground/20",
};

interface FindingListProps {
	items: ChecklistItem[];
	clientId: ClientId;
	clientShort: string;
	filter: Severity[];
	status: StatusFilter;
	openCheckId: string | null;
	followUps: string[];
	resolved: string[];
	onOpen: (checkId: string) => void;
	onEvidence: (item: ChecklistItem) => void;
	onFollowUp: (checkId: string) => void;
	resolutionPending: boolean;
	onResolve: (checkId: string) => void;
	onClearFilters: () => void;
}

export function FindingList({
	items,
	clientId,
	clientShort,
	filter,
	status,
	openCheckId,
	followUps,
	resolved,
	onOpen,
	onEvidence,
	onFollowUp,
	resolutionPending,
	onResolve,
	onClearFilters,
}: FindingListProps) {
	const visible = visibleFindings(
		items,
		clientId,
		filter,
		followUps,
		resolved,
		status,
	);
	const hiddenCount = items.length - visible.length;
	const allResolved =
		items.length > 0 && countMarked(items, resolved) === items.length;

	return (
		<div>
			<output>
				{allResolved && (
					<span className="mb-3 flex items-start gap-2 rounded-lg border border-low/40 bg-low-soft px-4 py-3 text-sm font-medium text-low">
						<CircleCheck
							aria-hidden="true"
							className="mt-0.5 size-4 shrink-0"
						/>
						<span>All of the highlights have been resolved.</span>
					</span>
				)}
			</output>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
				<span>
					Showing {visible.length} of {items.length} highlights
				</span>
				{hiddenCount > 0 && (
					<Button variant="ghost" size="sm" onClick={onClearFilters}>
						{hiddenCount} items hidden · Clear filters
					</Button>
				)}
			</div>
			<div className="space-y-4">
				{visible.length === 0 && (
					<p className="py-6 text-sm text-muted-foreground">
						No highlights match these filters.
					</p>
				)}
				{groupFindings(visible).map((group) => {
					const grouped = group.items.length > 1;
					return (
						<section
							key={group.key}
							aria-label={group.label}
							className="space-y-3"
						>
							{grouped && (
								<div className="flex items-baseline justify-between gap-3 px-1">
									<h3 className="text-sm font-semibold">{group.label}</h3>
									<span className="text-xs text-muted-foreground">
										{group.items.length} findings
									</span>
								</div>
							)}
							{group.items.map((item) => renderCard(item, grouped))}
						</section>
					);
				})}
			</div>
		</div>
	);

	function renderCard(item: ChecklistItem, grouped: boolean) {
		const index =
			items.findIndex((entry) => entry.check_id === item.check_id) + 1;
		const severity = severityOf(item, clientId);
		const assessment = assessmentFor(item, clientId);
		const heading = item.short_title || item.title;
		const parentHint = !grouped && item.title !== heading ? item.title : "";
		const open = openCheckId === item.check_id;
		const flagged = followUps.includes(item.check_id);
		const resolvedOn = resolvedButtonState(resolved.includes(item.check_id));
		const showEvidence =
			item.status !== "not_found" &&
			item.citation.verified &&
			Boolean(item.citation.page) &&
			Boolean(item.citation.excerpt);
		return (
			<div
				key={item.check_id}
				className={cn(
					"relative overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md",
					open ? riskBorderStrong[severity] : riskBorder[severity],
				)}
			>
				<div
					className={cn(
						"absolute inset-x-0 top-0 h-1",
						severityAccent[severity],
					)}
				/>
				<button
					type="button"
					onClick={() => onOpen(item.check_id)}
					className="w-full p-4 pt-5 text-left"
				>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 flex-1">
							{open ? (
								<>
									<span className="text-sm text-muted-foreground">
										Highlight {index}
										{parentHint ? ` · ${parentHint}` : ""}
										{item.clause ? ` · ${item.clause}` : ""}
									</span>
									<h3 className="mt-2 font-semibold">{heading}</h3>
									<p className="mt-2 text-sm leading-relaxed">
										<b>Document.</b> {item.document_says}
									</p>
									{assessment && (
										<p className="mt-2 text-sm leading-relaxed">
											<b>For {clientShort}.</b> {assessment.recommendation}
										</p>
									)}
								</>
							) : (
								<>
									<span className="text-xs font-medium text-muted-foreground">
										Highlight {index}
										{parentHint ? ` · ${parentHint}` : ""}
									</span>
									<h3 className="mt-1 font-semibold">{heading}</h3>
									<p className="mt-2 text-sm text-muted-foreground">
										{assessment?.summary ?? item.document_says}
									</p>
								</>
							)}
						</div>
						<SeverityChip severity={severity} />
					</div>
				</button>
				<div
					className={cn(
						"flex items-center gap-2 px-4 pb-4",
						!open && "justify-end",
					)}
				>
					{open && showEvidence && (
						<Button size="sm" onClick={() => onEvidence(item)}>
							<Link2 /> See evidence in document
						</Button>
					)}
					<div className="ml-auto flex gap-2">
						<Button
							size="sm"
							variant="outline"
							aria-pressed={flagged}
							className={cn(
								"border-evidence/50 text-evidence",
								flagged && "bg-evidence-soft",
							)}
							onClick={() => onFollowUp(item.check_id)}
						>
							<Flag className={cn(flagged && "fill-current")} />
							{flagged ? "Flagged" : "Follow-up"}
						</Button>
						<Button
							size="sm"
							variant="outline"
							aria-pressed={resolvedOn.pressed}
							disabled={resolutionPending}
							className={cn(
								"border-low/50 text-low",
								resolvedOn.filled && "bg-low-soft",
							)}
							onClick={() => onResolve(item.check_id)}
						>
							<CircleCheck
								className={cn(
									resolvedOn.filled &&
										"[&_circle]:fill-current [&_path]:fill-none [&_path]:stroke-white",
								)}
							/>
							{resolvedOn.label}
						</Button>
					</div>
				</div>
			</div>
		);
	}
}

function SeverityChip({ severity }: { severity: Severity }) {
	return (
		<span
			className={cn(
				"shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
				riskChip[severity],
			)}
		>
			{riskLabel[severity]}
		</span>
	);
}
