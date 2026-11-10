import { CheckCheck, Flag } from "lucide-react";
import {
	type StatusFilter,
	allIsSelected,
	countMarked,
	countRisk,
	riskLabel,
	severityOrder,
} from "../../lib/report-view";
import { severityAccent } from "../../lib/severity-style";
import { cn } from "../../lib/utils";
import type { ChecklistItem, ClientId, Severity } from "../../types";
import { Button } from "../ui/button";

const selectedChip =
	"border-foreground bg-foreground text-primary-foreground shadow-none hover:bg-foreground hover:text-primary-foreground";

function FilterDivider() {
	return <span className="mx-2 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

interface FilterBarProps {
	items: ChecklistItem[];
	clientId: ClientId | null;
	filter: Severity[];
	status: StatusFilter;
	followUps: string[];
	resolved: string[];
	enabled: boolean;
	onToggle: (risk: Severity) => void;
	onAll: () => void;
	onStatus: (status: StatusFilter) => void;
}

export function FilterBar({
	items,
	clientId,
	filter,
	status,
	followUps,
	resolved,
	enabled,
	onToggle,
	onAll,
	onStatus,
}: FilterBarProps) {
	const total = enabled ? items.length : 0;
	const showingAll = allIsSelected(filter, status);
	const flaggedCount = enabled ? countMarked(items, followUps) : 0;
	const resolvedCount = enabled ? countMarked(items, resolved) : 0;
	const statusChips = [
		{
			id: "flagged" as const,
			label: "Flagged",
			icon: Flag,
			count: flaggedCount,
		},
		{
			id: "resolved" as const,
			label: "Resolved",
			icon: CheckCheck,
			count: `${resolvedCount}/${total}`,
		},
	];

	return (
		<section
			aria-label="Risk filters"
			className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3"
		>
			<span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
				Filters
			</span>
			<Button
				variant={enabled && showingAll ? "outline" : "ghost"}
				size="sm"
				disabled={!enabled}
				aria-pressed={enabled && showingAll}
				onClick={onAll}
				className={cn(enabled && showingAll && selectedChip)}
			>
				All ({total})
			</Button>
			<FilterDivider />
			{severityOrder.map((risk) => {
				const selected = enabled && filter.includes(risk);
				const count =
					enabled && clientId ? countRisk(items, clientId, risk) : 0;
				return (
					<Button
						key={risk}
						variant="outline"
						size="sm"
						type="button"
						disabled={!enabled}
						aria-pressed={selected}
						onClick={() => onToggle(risk)}
						className={cn(
							"gap-2 shadow-none",
							selected
								? selectedChip
								: "border-border bg-background text-muted-foreground",
						)}
					>
						<span
							aria-hidden
							className={cn(
								"size-4 shrink-0 rounded-sm",
								severityAccent[risk],
								selected &&
									"ring-1 ring-primary-foreground ring-offset-1 ring-offset-foreground",
							)}
						/>
						{riskLabel[risk]} ({count})
					</Button>
				);
			})}
			<FilterDivider />
			{statusChips.map((chip) => {
				const selected = enabled && status === chip.id;
				const Icon = chip.icon;
				return (
					<Button
						key={chip.id}
						variant="outline"
						size="sm"
						type="button"
						disabled={!enabled}
						aria-pressed={selected}
						onClick={() => onStatus(selected ? null : chip.id)}
						className={cn(
							"gap-2 shadow-none",
							selected
								? selectedChip
								: "border-border bg-background text-muted-foreground",
						)}
					>
						<Icon className="size-3.5" />
						{chip.label} ({chip.count})
					</Button>
				);
			})}
		</section>
	);
}
