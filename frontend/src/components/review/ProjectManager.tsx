import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PROJECT_TITLE_MAX, nextProjectTitle } from "../../lib/project-title";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";

export function ProjectManager({
	title,
	error,
	onRename,
	onDelete,
}: {
	title: string;
	error: string | null;
	onRename: (title: string) => Promise<string | null>;
	onDelete: () => Promise<string | null>;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [deletingProject, setDeletingProject] = useState(false);
	const [draft, setDraft] = useState(title);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);
	const nextTitle = nextProjectTitle(title, draft);

	useEffect(() => {
		setDraft(title);
	}, [title]);

	const saveTitle = async () => {
		if (!nextTitle || saving) return;
		setSaving(true);
		setRenameError(null);
		setSaved(false);
		try {
			const message = await onRename(nextTitle);
			if (message) {
				setRenameError(message);
				return;
			}
			setSaved(true);
		} finally {
			setSaving(false);
		}
	};

	const confirmDelete = async () => {
		setDeletingProject(true);
		try {
			const message = await onDelete();
			if (!message) setConfirmOpen(false);
		} finally {
			setDeletingProject(false);
		}
	};

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="mx-auto max-w-4xl px-6 py-8">
				<h2 className="text-2xl font-semibold">Manage project</h2>
				{error && (
					<div
						role="alert"
						className="mt-4 rounded-xl border border-high/40 bg-high-soft px-4 py-3 text-sm text-high"
					>
						{error}
					</div>
				)}
				<section className="mt-8 border-t border-border py-8">
					<h3 className="font-semibold">
						<label htmlFor="project-title">Project title</label>
					</h3>
					<p className="mt-1 text-sm text-muted-foreground">
						Shown in the sidebar and the page header.
					</p>
					<form
						className="mt-4 flex flex-wrap items-center gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							void saveTitle();
						}}
					>
						<input
							id="project-title"
							value={draft}
							maxLength={PROJECT_TITLE_MAX}
							onChange={(event) => {
								setDraft(event.target.value);
								setSaved(false);
								setRenameError(null);
							}}
							className="h-9 min-w-[16rem] flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
						/>
						<Button type="submit" disabled={saving || nextTitle === null}>
							Save
						</Button>
					</form>
					{saved && (
						<p className="mt-2 text-sm text-low" aria-live="polite">
							Saved
						</p>
					)}
					{renameError && (
						<p role="alert" className="mt-2 text-sm text-high">
							{renameError}
						</p>
					)}
				</section>
				<section className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-8">
					<div>
						<h3 className="font-semibold">Delete project</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Remove this project, its document, and its chat. Flagged and
							resolved marks from this session are cleared too.
						</p>
					</div>
					<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
						<DialogTrigger asChild>
							<Button variant="destructive">
								<Trash2 /> Delete project
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Delete {title}?</DialogTitle>
								<DialogDescription>
									This removes the project, its document, and its chat. This
									cannot be undone.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button
									variant="outline"
									onClick={() => setConfirmOpen(false)}
									disabled={deletingProject}
								>
									Cancel
								</Button>
								<Button
									variant="destructive"
									onClick={() => void confirmDelete()}
									disabled={deletingProject}
								>
									Delete project
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</section>
			</div>
		</div>
	);
}
