import {
	ChevronDown,
	FileText,
	ListChecks,
	MessageSquare,
	Plus,
	Settings2,
} from "lucide-react";
import { type SectionId, projectSections } from "../../lib/project-sections";
import { cn } from "../../lib/utils";
import type { Conversation } from "../../types";
import { BrandLogo } from "../BrandLogo";
import { Button } from "../ui/button";

export type { SectionId };

const sectionIcons: Record<SectionId, typeof FileText> = {
	analysis: ListChecks,
	chat: MessageSquare,
	documents: FileText,
	manage: Settings2,
};

interface ProjectSidebarProps {
	projects: Conversation[];
	selectedId: string | null;
	section: SectionId;
	expanded: string[];
	clientLabels: Record<string, string>;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onSection: (id: string, section: SectionId) => void;
	onToggle: (id: string) => void;
}

export function ProjectSidebar({
	projects,
	selectedId,
	section,
	expanded,
	clientLabels,
	onSelect,
	onCreate,
	onSection,
	onToggle,
}: ProjectSidebarProps) {
	return (
		<aside className="flex w-72 shrink-0 flex-col border-r border-border bg-muted/40">
			<div className="px-5 py-5">
				<BrandLogo className="h-5 w-auto text-foreground" />
			</div>
			<div className="px-4">
				<Button variant="outline" className="w-full" onClick={onCreate}>
					<Plus /> New project
				</Button>
			</div>
			<div className="mt-6 px-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
				Projects
			</div>
			<nav className="mt-2 flex-1 space-y-1 overflow-auto px-2">
				{projects.map((project) => {
					const active = project.id === selectedId;
					const isOpen = expanded.includes(project.id);
					const client = clientLabels[project.id];
					const subtitle = project.has_document
						? `1 doc${client ? ` · ${client}` : ""}`
						: "No document yet";
					return (
						<div
							key={project.id}
							className={cn(
								"overflow-hidden rounded-xl border border-transparent transition-colors",
								active ? "border-border bg-card shadow-sm" : "hover:bg-card/60",
							)}
						>
							<div className="flex items-center gap-1 p-1.5">
								<button
									type="button"
									onClick={() => onSelect(project.id)}
									className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1.5 text-left"
								>
									<span
										className={cn(
											"grid size-8 shrink-0 place-items-center rounded-lg",
											active
												? "bg-primary text-primary-foreground"
												: "bg-muted text-muted-foreground",
										)}
									>
										<FileText className="size-4" />
									</span>
									<span className="min-w-0">
										<span
											className={cn(
												"block truncate text-sm font-medium",
												!active && "text-muted-foreground",
											)}
										>
											{project.title}
										</span>
										<span className="block truncate text-xs text-muted-foreground">
											{subtitle}
										</span>
									</span>
								</button>
								<Button
									variant="ghost"
									size="icon"
									className="size-7 shrink-0 text-muted-foreground"
									aria-label={`Toggle sections for ${project.title}`}
									aria-expanded={isOpen}
									onClick={() => onToggle(project.id)}
								>
									<ChevronDown
										className={cn(
											"transition-transform",
											!isOpen && "-rotate-90",
										)}
									/>
								</Button>
							</div>
							{isOpen && (
								<div
									className={cn(
										"space-y-0.5 px-1.5 pb-1.5",
										active && "border-t border-border bg-muted/30 pt-1.5",
									)}
								>
									{projectSections.map((item) => {
										const current = active && section === item.id;
										const Icon = sectionIcons[item.id];
										return (
											<button
												key={item.id}
												type="button"
												onClick={() => onSection(project.id, item.id)}
												aria-current={current ? "page" : undefined}
												className={cn(
													"relative flex h-8 w-full items-center gap-2.5 rounded-md pr-2 pl-11 text-sm transition-colors",
													current
														? "bg-primary font-medium text-primary-foreground shadow-sm"
														: "text-muted-foreground hover:bg-card/70 hover:text-foreground",
												)}
											>
												<Icon className="size-4" /> {item.label}
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</nav>
			<div className="mt-auto flex h-20 items-center gap-3 border-t border-border px-5">
				<div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
					LP
				</div>
				<div className="min-w-0">
					<div className="truncate text-sm font-medium">Liem Pham</div>
					<div className="truncate text-xs text-muted-foreground">
						Associate
					</div>
				</div>
			</div>
		</aside>
	);
}
