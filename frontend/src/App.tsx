import { ChevronRight, Loader2, Plus, Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { type CitationJump, DocumentViewer } from "./components/DocumentViewer";
import { EmptyState } from "./components/EmptyState";
import { ErrorNotice } from "./components/ErrorNotice";
import { ClientSetup, Initials } from "./components/review/ClientSetup";
import { DocumentSwitcher } from "./components/review/DocumentControls";
import { DocumentsView } from "./components/review/DocumentsView";
import { FilterBar } from "./components/review/FilterBar";
import { FindingList } from "./components/review/FindingList";
import { ProjectManager } from "./components/review/ProjectManager";
import {
	ProjectSidebar,
	type SectionId,
} from "./components/review/ProjectSidebar";
import { ReviewChecks } from "./components/review/ReviewChecks";
import { Button } from "./components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./components/ui/dialog";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "./components/ui/resizable";
import { useConversations } from "./hooks/use-conversations";
import { useDocument } from "./hooks/use-document";
import { useMessages } from "./hooks/use-messages";
import * as api from "./lib/api";
import {
	type SetupGroup,
	clientById,
	defaultCheckSelection,
	groupTitles,
	groupsFromCatalog,
	personaNamesFromCatalog,
	selectionFromReport,
	setupGroups,
} from "./lib/clients";
import { documentTypeLabel } from "./lib/document-type";
import { defaultSection } from "./lib/project-sections";
import { PROPERTY_NOT_FOUND, displayedPropertyLine } from "./lib/property-line";
import {
	type StatusFilter,
	selectAll,
	visibleFindings,
} from "./lib/report-view";
import { rowsForReport } from "./lib/review-checks";
import type {
	ChecklistItem,
	ClientId,
	DocumentTypeId,
	Severity,
	TitleChecklistReport,
} from "./types";

function propertyMissing(value: string): boolean {
	return value === PROPERTY_NOT_FOUND;
}

const sectionLabel: Record<SectionId, string> = {
	documents: "Documents",
	analysis: "Analysis",
	chat: "Chat",
	manage: "Manage project",
};

export default function App() {
	const {
		conversations,
		selectedId,
		loading: conversationsLoading,
		create,
		select,
		rename: renameConversation,
		remove: removeConversation,
		refresh: refreshConversations,
	} = useConversations();
	const {
		document,
		uploading,
		error: uploadError,
		upload,
		refresh: refreshDocument,
		remove: removeDocument,
	} = useDocument(selectedId);
	const {
		messages,
		loading: messagesLoading,
		error: messagesError,
		streaming,
		streamingContent,
		send,
	} = useMessages(selectedId, document?.id ?? null);

	const [section, setSection] = useState<SectionId>(defaultSection);
	const [expanded, setExpanded] = useState<string[]>([]);
	const [followUps, setFollowUps] = useState<Record<string, string[]>>({});
	const [savingResolution, setSavingResolution] = useState<
		Record<string, boolean>
	>({});
	const activeResolutions = useRef(new Set<string>());
	const [reports, setReports] = useState<
		Record<string, TitleChecklistReport | null>
	>({});
	const [reportLoadingId, setReportLoadingId] = useState<string | null>(null);
	const [runningProjects, setRunningProjects] = useState<
		Record<string, boolean>
	>({});
	const [reportErrors, setReportErrors] = useState<
		Record<string, string | null>
	>({});
	const reportVersions = useRef(new Map<string, number>());
	const activeRuns = useRef(new Map<string, number>());
	const report = selectedId ? (reports[selectedId] ?? null) : null;
	const reportLoading = selectedId !== null && reportLoadingId === selectedId;
	const running = selectedId ? Boolean(runningProjects[selectedId]) : false;
	const reportError = selectedId ? (reportErrors[selectedId] ?? null) : null;
	const [filter, setFilter] = useState<Severity[]>([]);
	const [status, setStatus] = useState<StatusFilter>(null);
	const [openCheckId, setOpenCheckId] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [jump, setJump] = useState<CitationJump | null>(null);
	const [checksOpen, setChecksOpen] = useState(false);
	const [checksByClient, setChecksByClient] = useState(defaultCheckSelection);
	const [groupsByClient, setGroupsByClient] =
		useState<Record<ClientId, SetupGroup[]>>(setupGroups);
	const [personaNames, setPersonaNames] = useState<Record<ClientId, string>>({
		willowbank: "Residential Developer",
		northstar: "Commercial Tenant",
	});
	const [manageError, setManageError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		api
			.fetchPersonas()
			.then((catalog) => {
				if (cancelled) return;
				const nextGroups = groupsFromCatalog(catalog);
				setGroupsByClient(nextGroups);
				setPersonaNames(personaNamesFromCatalog(catalog));
				setChecksByClient((prev) => defaultCheckSelection(nextGroups, prev));
			})
			.catch(() => {
				// The built-in lists match the shipped persona file.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!selectedId && conversations[0]) select(conversations[0].id);
	}, [conversations, selectedId, select]);

	useEffect(() => {
		if (!selectedId) {
			setManageError(null);
			return;
		}
		setManageError(null);
		setExpanded((ids) =>
			ids.includes(selectedId) ? ids : [...ids, selectedId],
		);
		let cancelled = false;
		const version = reportVersions.current.get(selectedId);
		setReportLoadingId(selectedId);
		setReportErrors((prev) => ({ ...prev, [selectedId]: null }));
		setJump(null);
		setPage(1);
		setOpenCheckId(null);
		setFilter(selectAll().filter);
		setStatus(selectAll().status);
		api
			.fetchTitleChecklist(selectedId)
			.then((loaded) => {
				if (cancelled || reportVersions.current.get(selectedId) !== version)
					return;
				setReports((prev) => ({ ...prev, [selectedId]: loaded }));
				if (loaded) {
					setChecksByClient((prev) => ({
						...prev,
						[loaded.client_id]: selectionFromReport(
							loaded.client_id,
							prev[loaded.client_id],
							loaded.items.map((item) => item.title),
							groupsByClient,
							loaded.requested_checks,
						),
					}));
				}
			})
			.catch((err: unknown) => {
				if (!cancelled && reportVersions.current.get(selectedId) === version) {
					setReportErrors((prev) => ({
						...prev,
						[selectedId]:
							err instanceof Error ? err.message : "Could not load the report.",
					}));
				}
			})
			.finally(() => {
				if (!cancelled) setReportLoadingId(null);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedId, groupsByClient]);

	const clientId = report?.client_id ?? null;
	const client = clientById(clientId);

	useEffect(() => {
		if (!report || !clientId || !selectedId) return;
		const visible = visibleFindings(
			report.items,
			clientId,
			filter,
			followUps[selectedId] ?? [],
			report.resolved_ids ?? [],
			status,
		);
		setOpenCheckId((current) => {
			if (current && visible.some((item) => item.check_id === current))
				return current;
			return visible[0]?.check_id ?? null;
		});
	}, [report, clientId, filter, followUps, status, selectedId]);

	useEffect(() => {
		if (!report || !openCheckId) return;
		const item = report.items.find((entry) => entry.check_id === openCheckId);
		if (item && item.status !== "not_found" && item.citation.page) {
			setPage(item.citation.page);
		}
	}, [openCheckId, report]);

	const handleCreate = useCallback(async () => {
		const created = await create();
		if (created) setSection(defaultSection);
	}, [create]);

	const clearProjectReport = useCallback((id: string) => {
		reportVersions.current.set(id, (reportVersions.current.get(id) ?? 0) + 1);
		activeRuns.current.delete(id);
		setReports((prev) => ({ ...prev, [id]: null }));
		setRunningProjects((prev) => ({ ...prev, [id]: false }));
		setReportErrors((prev) => ({ ...prev, [id]: null }));
	}, []);

	const handleDeleteProject = useCallback(async () => {
		if (!selectedId) return "Select a project first.";
		const id = selectedId;
		const message = await removeConversation(id);
		if (message) {
			setManageError(message);
			return message;
		}
		setManageError(null);
		setFollowUps((prev) => {
			const next = { ...prev };
			delete next[id];
			return next;
		});
		setExpanded((ids) => ids.filter((item) => item !== id));
		clearProjectReport(id);
		return null;
	}, [selectedId, removeConversation, clearProjectReport]);

	const handleRemoveDocument = useCallback(
		async (documentId: string) => {
			if (!selectedId) return "Select a project first.";
			const message = await removeDocument(documentId);
			if (message) {
				setManageError(message);
				return message;
			}
			setManageError(null);
			clearProjectReport(selectedId);
			setJump(null);
			setFollowUps((prev) => ({ ...prev, [selectedId]: [] }));
			void refreshConversations();
			return null;
		},
		[selectedId, removeDocument, refreshConversations, clearProjectReport],
	);

	const handleUpload = useCallback(
		async (file: File) => {
			const doc = await upload(file);
			if (doc) {
				refreshDocument();
				await refreshConversations();
			}
		},
		[upload, refreshDocument, refreshConversations],
	);

	const handleRun = useCallback(
		async (
			nextClient: ClientId,
			checks: { title: string; category: string }[],
			documentType: DocumentTypeId = "title-report",
		) => {
			if (!selectedId || activeRuns.current.has(selectedId)) return;
			const id = selectedId;
			const version = (reportVersions.current.get(id) ?? 0) + 1;
			reportVersions.current.set(id, version);
			activeRuns.current.set(id, version);
			setRunningProjects((prev) => ({ ...prev, [id]: true }));
			setReportErrors((prev) => ({ ...prev, [id]: null }));
			try {
				const force =
					sessionStorage.getItem("orbital-force-checklist-error") === "1";
				if (force) sessionStorage.removeItem("orbital-force-checklist-error");
				const next = await api.runTitleChecklist(
					id,
					nextClient,
					checks,
					force,
					documentType,
				);
				if (activeRuns.current.get(id) !== version) return;
				reportVersions.current.set(id, version + 1);
				setReports((prev) => ({ ...prev, [id]: next }));
				void refreshConversations();
			} catch (err: unknown) {
				if (activeRuns.current.get(id) !== version) return;
				setReportErrors((prev) => ({
					...prev,
					[id]:
						err instanceof Error
							? err.message
							: "The report could not be generated.",
				}));
			} finally {
				if (activeRuns.current.get(id) === version) {
					activeRuns.current.delete(id);
					setRunningProjects((prev) => ({ ...prev, [id]: false }));
				}
			}
		},
		[selectedId, refreshConversations],
	);

	const toggleCheck = useCallback((id: ClientId, title: string) => {
		setChecksByClient((prev) => ({
			...prev,
			[id]: { ...prev[id], [title]: !prev[id][title] },
		}));
	}, []);

	const handleEvidence = useCallback((item: ChecklistItem) => {
		if (
			item.status === "not_found" ||
			!item.citation.verified ||
			!item.citation.page ||
			!item.citation.excerpt
		)
			return;
		setOpenCheckId(item.check_id);
		setPage(item.citation.page);
		setJump({
			page: item.citation.page,
			excerpt: item.citation.excerpt,
			clause: item.clause,
			nonce: Date.now(),
		});
	}, []);

	const toggleFollowUp = useCallback(
		(checkId: string) => {
			if (!selectedId) return;
			setFollowUps((prev) => {
				const current = prev[selectedId] ?? [];
				const next = current.includes(checkId)
					? current.filter((id) => id !== checkId)
					: [...current, checkId];
				return { ...prev, [selectedId]: next };
			});
		},
		[selectedId],
	);

	const toggleResolved = useCallback(
		async (checkId: string) => {
			if (
				!selectedId ||
				!report?.review_id ||
				activeResolutions.current.has(selectedId)
			)
				return;
			const id = selectedId;
			const reviewId = report.review_id;
			const version = reportVersions.current.get(id);
			activeResolutions.current.add(id);
			setSavingResolution((prev) => ({ ...prev, [id]: true }));
			setReportErrors((prev) => ({ ...prev, [id]: null }));
			try {
				const updated = await api.updateResolution(
					id,
					reviewId,
					checkId,
					!report.resolved_ids?.includes(checkId),
				);
				if (reportVersions.current.get(id) !== version) return;
				reportVersions.current.set(id, (version ?? 0) + 1);
				setReports((prev) =>
					prev[id]?.review_id === reviewId ? { ...prev, [id]: updated } : prev,
				);
			} catch (err) {
				if (reportVersions.current.get(id) !== version) return;
				setReportErrors((prev) => ({
					...prev,
					[id]:
						err instanceof Error ? err.message : "Could not save resolution.",
				}));
			} finally {
				activeResolutions.current.delete(id);
				setSavingResolution((prev) => ({ ...prev, [id]: false }));
			}
		},
		[selectedId, report],
	);

	const project = conversations.find((item) => item.id === selectedId) ?? null;
	const propertyLine = displayedPropertyLine(
		report?.property_line,
		project?.property_line,
	);
	const projectFollowUps = selectedId ? (followUps[selectedId] ?? []) : [];
	const projectResolved = report?.resolved_ids ?? [];
	const clientLabels = Object.fromEntries(
		Object.entries(reports).map(([id, value]) => [
			id,
			clientById(value?.client_id ?? null)?.short ?? "",
		]),
	);

	return (
		<div className="flex h-screen bg-background font-sans text-foreground">
			<ProjectSidebar
				projects={conversations}
				selectedId={selectedId}
				section={section}
				expanded={expanded}
				clientLabels={clientLabels}
				onSelect={(id) => {
					select(id);
					setSection(defaultSection);
				}}
				onCreate={() => void handleCreate()}
				onSection={(id, next) => {
					select(id);
					setSection(next);
				}}
				onToggle={(id) =>
					setExpanded((ids) =>
						ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
					)
				}
			/>
			<main className="flex min-w-0 flex-1 flex-col">
				{!project ? (
					<div className="grid flex-1 place-items-center">
						{conversationsLoading ? (
							<Loader2 className="size-6 animate-spin text-muted-foreground" />
						) : (
							<div className="text-center">
								<h1 className="text-2xl font-semibold">No projects</h1>
								<Button className="mt-4" onClick={() => void handleCreate()}>
									<Plus /> New project
								</Button>
							</div>
						)}
					</div>
				) : (
					<>
						<header className="flex items-start justify-between border-b border-border px-6 py-3">
							<div>
								<h1 className="flex items-center gap-2 font-semibold">
									{project.title}
									<ChevronRight className="size-4 text-muted-foreground" />
									<span className="font-normal text-muted-foreground">
										{sectionLabel[section]}
									</span>
								</h1>
								{!document && (
									<p className="text-sm text-muted-foreground">
										Upload a title commitment to begin.
									</p>
								)}
							</div>
						</header>
						{section === "chat" ? (
							<ChatWindow
								messages={messages}
								loading={messagesLoading}
								error={messagesError}
								streaming={streaming}
								streamingContent={streamingContent}
								hasDocument={Boolean(document)}
								conversationId={selectedId}
								onSend={(text) => void send(text)}
							/>
						) : section === "manage" ? (
							<ProjectManager
								title={project.title}
								error={manageError}
								onRename={(title) =>
									selectedId
										? renameConversation(selectedId, title)
										: Promise.resolve("Select a project first.")
								}
								onDelete={handleDeleteProject}
							/>
						) : !document ? (
							<EmptyState
								onUpload={handleUpload}
								uploading={uploading}
								error={uploadError}
							/>
						) : section === "documents" ? (
							<DocumentsView
								document={document}
								page={page}
								onPageChange={setPage}
								jump={jump}
								error={manageError}
								onDelete={handleRemoveDocument}
							/>
						) : (
							<>
								<section className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-paper px-6 py-4">
									<div>
										<DocumentSwitcher
											name={document.filename}
											count={document ? 1 : 0}
										/>
										<dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1 text-sm">
											<dt className="text-muted-foreground">Type</dt>
											<dd>{documentTypeLabel(report ?? document)}</dd>
											{client && (
												<>
													<dt className="text-muted-foreground">To</dt>
													<dd>{client.to}</dd>
													<dt className="text-muted-foreground">Property</dt>
													<dd
														className={
															propertyMissing(propertyLine)
																? "text-muted-foreground"
																: undefined
														}
													>
														{propertyLine}
													</dd>
												</>
											)}
										</dl>
									</div>
									{client && (
										<div className="text-right">
											<div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
												Persona
											</div>
											<div className="mt-2 flex flex-col items-end gap-2">
												<div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
													<Initials
														id={client.id}
														initials={client.initials}
														small
													/>
													<span className="text-left leading-tight">
														<span className="block">
															{personaNames[client.id] ?? client.persona}
														</span>
														<span className="block text-xs text-muted-foreground">
															{client.short}
														</span>
													</span>
												</div>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setChecksOpen(true)}
												>
													<Settings2 /> Document checks
												</Button>
											</div>
										</div>
									)}
								</section>
								<FilterBar
									items={report?.items ?? []}
									clientId={clientId}
									filter={filter}
									status={status}
									followUps={projectFollowUps}
									resolved={projectResolved}
									enabled={Boolean(report && clientId)}
									onAll={() => {
										const next = selectAll();
										setFilter(next.filter);
										setStatus(next.status);
									}}
									onStatus={setStatus}
									onToggle={(risk) =>
										setFilter((current) =>
											current.includes(risk)
												? current.filter((item) => item !== risk)
												: [...current, risk],
										)
									}
								/>
								<div className="flex min-h-0 flex-1">
									<ResizablePanelGroup
										orientation="horizontal"
										className="min-h-0 flex-1 p-5"
									>
										<ResizablePanel defaultSize="50%" minSize="30%">
											<div className="h-full overflow-y-auto pr-5">
												{report && reportError && (
													<div className="mb-4">
														<ErrorNotice
															message={reportError}
															title="Could not update the review."
														/>
													</div>
												)}
												{uploadError && (
													<div
														role="alert"
														className="mb-4 rounded-xl border border-high/40 bg-high-soft px-4 py-3 text-sm text-high"
													>
														{uploadError}
													</div>
												)}
												{reportLoading ? (
													<div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
														<Loader2 className="size-4 animate-spin" /> Loading
														the report…
													</div>
												) : report && client ? (
													<FindingList
														items={report.items}
														clientId={client.id}
														clientShort={
															personaNames[client.id] ?? client.persona
														}
														filter={filter}
														status={status}
														openCheckId={openCheckId}
														followUps={projectFollowUps}
														resolved={projectResolved}
														onOpen={(checkId) => {
															setJump(null);
															setOpenCheckId(checkId);
														}}
														onEvidence={handleEvidence}
														onFollowUp={toggleFollowUp}
														resolutionPending={Boolean(
															savingResolution[selectedId ?? ""],
														)}
														onResolve={toggleResolved}
														onClearFilters={() => {
															const next = selectAll();
															setFilter(next.filter);
															setStatus(next.status);
														}}
													/>
												) : (
													<ClientSetup
														key={document.id}
														running={running}
														error={reportError}
														selection={checksByClient}
														groups={groupsByClient}
														personaLabels={personaNames}
														onToggle={toggleCheck}
														onRun={(id, documentType, checks) =>
															void handleRun(id, checks, documentType)
														}
													/>
												)}
											</div>
										</ResizablePanel>
										<ResizableHandle withHandle />
										<ResizablePanel defaultSize="50%" minSize="20%">
											<div className="flex h-full min-w-0 pl-5">
												<DocumentViewer
													document={document}
													page={page}
													onPageChange={setPage}
													jump={jump}
												/>
											</div>
										</ResizablePanel>
									</ResizablePanelGroup>
								</div>
								{client && (
									<Dialog open={checksOpen} onOpenChange={setChecksOpen}>
										<DialogContent className="max-h-[85vh] overflow-auto">
											<DialogHeader>
												<DialogTitle>Document checks</DialogTitle>
												<DialogDescription>
													Checks analysed for {client.name}
												</DialogDescription>
											</DialogHeader>
											<ReviewChecks
												rows={
													report
														? rowsForReport(
																groupsByClient[client.id],
																groupTitles(groupsByClient[client.id]),
																report,
															)
														: []
												}
											/>
										</DialogContent>
									</Dialog>
								)}
							</>
						)}
					</>
				)}
			</main>
		</div>
	);
}
