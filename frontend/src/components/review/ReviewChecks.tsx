import { Check, Lock, X } from "lucide-react";
import {
	type ReviewCheckRow,
	analysedCountLabel,
} from "../../lib/review-checks";
import { cn } from "../../lib/utils";

export function ReviewChecks({ rows }: { rows: ReviewCheckRow[] }) {
	const categories: { category: string; rows: ReviewCheckRow[] }[] = [];
	for (const row of rows) {
		const group = categories.find((entry) => entry.category === row.category);
		if (group) group.rows.push(row);
		else categories.push({ category: row.category, rows: [row] });
	}

	return (
		<div>
			<div className="flex items-center justify-between gap-3 pt-4 text-sm font-semibold">
				Document checks
				<span className="font-normal text-muted-foreground">
					{analysedCountLabel(rows)}
				</span>
			</div>
			{categories.map((group) => (
				<div key={group.category} className="mt-3">
					<div className="flex items-center gap-2 border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						<Lock className="size-3" aria-hidden />
						{group.category}
					</div>
					<ul className="divide-y divide-border">
						{group.rows.map((row) => (
							<li
								key={row.title}
								className={cn(
									"flex items-center gap-3 py-2.5 text-sm",
									row.analysed ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{row.analysed ? (
									<Check className="size-4 shrink-0 text-low" aria-hidden />
								) : (
									<X
										className="size-4 shrink-0 text-muted-foreground"
										aria-hidden
									/>
								)}
								<span className="min-w-0 flex-1">{row.title}</span>
								{!row.analysed && (
									<span className="shrink-0 text-xs text-muted-foreground">
										Not analysed
									</span>
								)}
							</li>
						))}
					</ul>
				</div>
			))}
			<p className="mt-4 text-sm text-muted-foreground">
				To change the checks, start a new review.
			</p>
		</div>
	);
}
