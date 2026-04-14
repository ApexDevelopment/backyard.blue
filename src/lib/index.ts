// place files you want to import through the `$lib` alias in this folder.

const URL_RE = /(?:https?:\/\/[^\s<>"')\]]+)|(?:(?<=^|[\s(])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<>"')\]]*)?)/g;

const ESC: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (ch) => ESC[ch]);
}

export function linkifyBio(text: string): string {
	const escaped = escapeHtml(text);
	return escaped.replace(URL_RE, (url) => {
		const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
		let display = url.replace(/^https?:\/\//, '');
		if (display.endsWith('/')) display = display.slice(0, -1);
		return `<a href="${href}" target="_blank" rel="noopener noreferrer">${display}</a>`;
	});
}
