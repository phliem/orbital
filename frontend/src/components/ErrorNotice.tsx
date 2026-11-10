import { errorNoticeCopy } from "../lib/api-key-error";

export function ErrorNotice({
	message,
	title,
}: {
	message: string;
	title: string;
}) {
	const copy = errorNoticeCopy(message, title);
	return (
		<div
			role="alert"
			className="rounded-xl border border-high/40 bg-high-soft px-4 py-3 text-sm text-high"
		>
			<p className="font-medium">{copy.title}</p>
			{copy.body !== copy.title && <p className="mt-1">{copy.body}</p>}
		</div>
	);
}
