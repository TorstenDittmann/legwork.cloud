export type IncidentDescriptionBlock =
	| { type: 'code'; language: string; text: string }
	| { type: 'heading'; text: string }
	| { type: 'list'; items: string[] }
	| { type: 'paragraph'; text: string }
	| { type: 'quote'; text: string };

export type IncidentInlinePart = {
	type: 'code' | 'strong' | 'text';
	text: string;
};

export function parseIncidentInline(value: string): IncidentInlinePart[] {
	return value
		.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)
		.filter(Boolean)
		.map((part) => {
			if (part.startsWith('**') && part.endsWith('**'))
				return { type: 'strong' as const, text: part.slice(2, -2) };
			if (part.startsWith('`') && part.endsWith('`'))
				return { type: 'code' as const, text: part.slice(1, -1) };
			return { type: 'text' as const, text: part };
		});
}

export function parseIncidentDescription(value: string): IncidentDescriptionBlock[] {
	const lines = value.replaceAll('\r\n', '\n').split('\n');
	const blocks: IncidentDescriptionBlock[] = [];
	let paragraph: string[] = [];
	let listItems: string[] = [];

	const flushParagraph = () => {
		if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
		paragraph = [];
	};
	const flushList = () => {
		if (listItems.length) blocks.push({ type: 'list', items: listItems });
		listItems = [];
	};
	const flushText = () => {
		flushParagraph();
		flushList();
	};

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const trimmed = line.trim();
		const fence = trimmed.match(/^```([^`]*)$/);
		if (fence) {
			flushText();
			const content: string[] = [];
			for (index += 1; index < lines.length; index += 1) {
				const codeLine = lines[index] ?? '';
				if (codeLine.trim() === '```') break;
				content.push(codeLine);
			}
			blocks.push({ type: 'code', language: fence[1]?.trim() ?? '', text: content.join('\n') });
			continue;
		}
		if (!trimmed) {
			flushText();
			continue;
		}
		const heading = trimmed.match(/^\*\*(.+)\*\*$/);
		if (heading) {
			flushText();
			blocks.push({ type: 'heading', text: heading[1]?.trim() ?? '' });
			continue;
		}
		const listItem = trimmed.match(/^[*-]\s+(.+)$/);
		if (listItem) {
			flushParagraph();
			listItems.push(listItem[1]?.trim() ?? '');
			continue;
		}
		const quote = trimmed.match(/^>\s?(.*)$/);
		if (quote) {
			flushText();
			blocks.push({ type: 'quote', text: quote[1]?.trim() ?? '' });
			continue;
		}
		flushList();
		paragraph.push(trimmed);
	}
	flushText();
	return blocks;
}

const internalValidationPattern =
	/invalid_(?:type|union)|unrecognized_keys|zod|model_diagnosis|evidence\[\d+\]|"path"\s*:\s*\[\s*"evidence"/i;
const SAFE_VALIDATION_LIMITATION =
	'The generated evidence references did not match the inspected sources.';

export function userFacingLimitations(limitations: string[]): string[] {
	const safe = limitations
		.map((limitation) => limitation.trim())
		.filter(Boolean)
		.map((limitation) =>
			internalValidationPattern.test(limitation)
				? SAFE_VALIDATION_LIMITATION
				: limitation.length > 600
					? `${limitation.slice(0, 599).trimEnd()}…`
					: limitation
		);
	return [...new Set(safe)];
}
