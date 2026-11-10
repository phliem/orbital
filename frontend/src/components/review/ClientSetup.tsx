import { Check, UserPlus } from "lucide-react";
import { useState } from "react";
import {
	type CheckSelection,
	type SetupGroup,
	clientById,
	clients,
	selectedChecks,
	selectedCount,
	setupGroups,
} from "../../lib/clients";
import { documentTypes } from "../../lib/document-type";
import { addedChecksForRun, canRunReport } from "../../lib/run-report";
import { cn } from "../../lib/utils";
import type { ClientId, DocumentTypeId } from "../../types";

import { ErrorNotice } from "../ErrorNotice";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { CheckGroups } from "./CheckGroups";

interface ClientSetupProps {
	running: boolean;
	error?: string | null;
	selection: Record<ClientId, CheckSelection>;
	groups?: Record<ClientId, SetupGroup[]>;
	personaLabels?: Record<ClientId, string>;
	onToggle: (clientId: ClientId, title: string) => void;
	onRun: (
		clientId: ClientId,
		documentType: DocumentTypeId,
		checks: { title: string; category: string }[],
	) => void;
}

function StepLabel({
	n,
	children,
	className,
}: {
	n: number;
	children: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mt-8 flex items-center gap-2 text-xs font-medium text-muted-foreground",
				className,
			)}
		>
			<span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
				{n}
			</span>
			{children}
		</div>
	);
}

export function ClientSetup({
	running,
	error,
	selection,
	groups = setupGroups,
	personaLabels,
	onToggle,
	onRun,
}: ClientSetupProps) {
	const [chosenId, setChosenId] = useState<ClientId | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [documentType, setDocumentType] =
		useState<DocumentTypeId>("title-report");
	const [added, setAdded] = useState<
		Record<"commercial-lease" | "environmental-assessments", CheckSelection>
	>({ "commercial-lease": {}, "environmental-assessments": {} });
	const [draft, setDraft] = useState("");
	const chosen = clientById(chosenId);
	const customSelection =
		documentType === "title-report" ? null : added[documentType];
	const checks = chosen
		? documentType === "title-report"
			? selectedChecks(chosen.id, selection[chosen.id], groups)
			: addedChecksForRun(added[documentType])
		: [];
	const selected =
		documentType === "title-report" && chosen
			? selectedCount(selection[chosen.id])
			: checks.length;

	const addCheck = () => {
		const title = draft.trim();
		if (!title || documentType === "title-report") return;
		setAdded((current) => {
			const bucket = current[documentType];
			if (title in bucket) return current;
			return {
				...current,
				[documentType]: { ...bucket, [title]: true },
			};
		});
		setDraft("");
	};

	return (
		<div className="mx-auto flex min-h-full max-w-xl flex-col justify-center py-5">
			<h2 className="text-3xl font-semibold">Set up your review</h2>
			<StepLabel n={1} className="mt-6">
				Choose a persona
			</StepLabel>
			<div aria-label="Client" className="mt-3 grid gap-2">
				{clients.map((client) => {
					const selectedClient = client.id === chosenId;
					return (
						<button
							key={client.id}
							type="button"
							aria-pressed={selectedClient}
							disabled={running}
							onClick={() => setChosenId(client.id)}
							className={cn(
								"flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition",
								selectedClient
									? "border-primary ring-2 ring-primary/20"
									: "border-border hover:border-primary/40",
							)}
						>
							<Initials id={client.id} initials={client.initials} />
							<div className="min-w-0 flex-1">
								<div className="text-xs text-muted-foreground">
									{personaLabels?.[client.id] ?? client.persona}
								</div>
								<div className="font-semibold">{client.name}</div>
							</div>
							<span
								className={cn(
									"grid size-5 shrink-0 place-items-center rounded-full border",
									selectedClient
										? "border-primary bg-primary text-primary-foreground"
										: "border-border",
								)}
							>
								{selectedClient && <Check className="size-3" />}
							</span>
						</button>
					);
				})}
				<button
					type="button"
					onClick={() => setAddOpen(true)}
					className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
				>
					<UserPlus className="size-4" /> Add new client
				</button>
			</div>
			{chosen ? (
				<>
					<StepLabel n={2}>Choose the document type</StepLabel>
					<div aria-label="Document type" className="mt-3 grid gap-2">
						{documentTypes.map((type) => {
							const on = type.id === documentType;
							return (
								<button
									key={type.id}
									type="button"
									aria-pressed={on}
									onClick={() => setDocumentType(type.id)}
									className={cn(
										"flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition",
										on
											? "border-primary ring-2 ring-primary/20"
											: "border-border hover:border-primary/40",
									)}
								>
									<div className="min-w-0 flex-1 font-semibold">
										{type.label}
									</div>
									<span
										className={cn(
											"grid size-5 shrink-0 place-items-center rounded-full border",
											on
												? "border-primary bg-primary text-primary-foreground"
												: "border-border",
										)}
									>
										{on && <Check className="size-3" />}
									</span>
								</button>
							);
						})}
					</div>
					<StepLabel n={3}>Confirm the checks</StepLabel>
					<div className="mt-3 rounded-xl border border-border bg-card px-4 pb-4 shadow-sm">
						{documentType === "title-report" ? (
							<CheckGroups
								clientId={chosen.id}
								selection={selection[chosen.id]}
								groups={groups[chosen.id]}
								onToggle={(title) => onToggle(chosen.id, title)}
							/>
						) : (
							<>
								{customSelection &&
									Object.keys(customSelection).length === 0 && (
										<p className="pt-4 text-sm text-muted-foreground">
											No recommended checks for this document type yet. Add the
											checks you want analysed.
										</p>
									)}
								{customSelection && Object.keys(customSelection).length > 0 && (
									<CheckGroups
										clientId={chosen.id}
										selection={customSelection}
										groups={[
											{
												category: "Added by you",
												titles: Object.keys(customSelection),
											},
										]}
										onToggle={(title) =>
											setAdded((current) => ({
												...current,
												[documentType]: {
													...current[documentType],
													[title]: !current[documentType][title],
												},
											}))
										}
									/>
								)}
								<div className="mt-4 flex gap-2">
									<input
										aria-label="Add a check"
										value={draft}
										onChange={(event) => setDraft(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												addCheck();
											}
										}}
										placeholder="Add a check"
										className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm shadow-sm"
									/>
									<Button
										type="button"
										variant="outline"
										disabled={!draft.trim()}
										onClick={addCheck}
									>
										Add
									</Button>
								</div>
							</>
						)}
					</div>
					{error && (
						<div className="mt-4">
							<ErrorNotice
								message={error}
								title="The report could not be generated."
							/>
						</div>
					)}
					<Button
						className="mt-4 w-full"
						size="lg"
						disabled={running || !canRunReport(selected)}
						onClick={() => onRun(chosen.id, documentType, checks)}
					>
						{running ? "Reading the document…" : `Run report for ${chosen.cta}`}
					</Button>
				</>
			) : (
				<div className="mt-8 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
					Pick a persona to see its title categories.
				</div>
			)}
			<Dialog open={addOpen} onOpenChange={setAddOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add new client</DialogTitle>
						<DialogDescription>
							Adding clients is not supported yet.
						</DialogDescription>
					</DialogHeader>
					<Button variant="outline" onClick={() => setAddOpen(false)}>
						Close
					</Button>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export function Initials({
	id,
	initials,
	small,
}: {
	id: string;
	initials: string;
	small?: boolean;
}) {
	return (
		<span
			className={cn(
				"grid place-items-center rounded-full font-semibold",
				id === "willowbank"
					? "bg-secondary text-primary"
					: "bg-evidence-soft text-high",
				small ? "size-6 text-[10px]" : "size-9 text-sm",
			)}
		>
			{initials}
		</span>
	);
}
