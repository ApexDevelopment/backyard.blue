import { readFile } from 'node:fs/promises';
import { marked } from 'marked';

function getPath(envVar: string): string | undefined {
	const val = process.env[envVar];
	return val && val.trim() ? val.trim() : undefined;
}

export function hasTos(): boolean {
	return !!getPath('TOS_PATH');
}

export function hasCommunityGuidelines(): boolean {
	return !!getPath('COMMUNITY_GUIDELINES_PATH');
}

async function renderFile(filePath: string): Promise<string> {
	const raw = await readFile(filePath, 'utf-8');
	if (filePath.endsWith('.md') || filePath.endsWith('.markdown')) {
		return await marked.parse(raw);
	}
	// Plain text: escape HTML and wrap in <pre>
	const escaped = raw
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	return `<pre>${escaped}</pre>`;
}

export async function getTosHtml(): Promise<string | null> {
	const path = getPath('TOS_PATH');
	if (!path) return null;
	return renderFile(path);
}

export async function getCommunityGuidelinesHtml(): Promise<string | null> {
	const path = getPath('COMMUNITY_GUIDELINES_PATH');
	if (!path) return null;
	return renderFile(path);
}
