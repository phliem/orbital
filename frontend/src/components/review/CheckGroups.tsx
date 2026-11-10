import { Check, Lock } from "lucide-react";
import {
	type CheckSelection,
	selectedCount,
	setupGroups,
} from "../../lib/clients";
import { cn } from "../../lib/utils";
import type { ClientId } from "../../types";

export function CheckGroups({
	clientId,
	selection,
	onToggle,
	groups,
}: {
	clientId: ClientId;
	selection: CheckSelection;
	onToggle: (title: string) => void;
	groups?: { category: string; titles: string[] }[];
}) {
	const resolved = groups ?? setupGroups[clientId];
	return (
		<div>
			<div className="flex items-center justify-between gap-3 pt-4 text-sm font-semibold">
				Document checks
				<span className="font-normal text-muted-foreground">
					{selectedCount(selection)} selected
				</span>
			</div>
			{resolved.map((group) => (
				<div key={group.category} className="mt-3">
					<div className="flex items-center gap-2 border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						<Lock className="size-3" aria-hidden />
						{group.category}
					</div>
					<div className="divide-y divide-border">
						{group.titles.map((title) => {
							const on = Boolean(selection[title]);
							return (
								<button
									key={title}
									type="button"
									aria-pressed={on}
									onClick={() => onToggle(title)}
									className="flex w-full items-center gap-3 py-2.5 text-left text-sm"
								>
									<span
										className={cn(
											"grid size-4 shrink-0 place-items-center rounded-sm border",
											on
												? "border-primary bg-primary text-primary-foreground"
												: "border-border bg-card",
										)}
									>
										{on && <Check className="size-3" />}
									</span>
									<span>{title}</span>
								</button>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}
