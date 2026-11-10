export function errorNoticeCopy(
	message: string,
	fallbackTitle: string,
): { title: string; body: string } {
	const heading = "No LLM API key configured.";
	if (message.startsWith("No LLM API key configured")) {
		const rest = message.slice(heading.length).trim();
		return { title: heading, body: rest || message };
	}
	return { title: fallbackTitle, body: message };
}
