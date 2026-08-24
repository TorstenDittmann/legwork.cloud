import { describe, expect, it } from 'vitest';
import {
	parseIncidentDescription,
	parseIncidentInline,
	userFacingLimitations
} from './incident-presentation';

describe('incident presentation', () => {
	it('turns alert markdown into bounded semantic blocks', () => {
		const description = [
			'**Observed behavior**',
			'',
			'- Eight replicas are active',
			'- Pool size is `25`',
			'',
			'> MariaDB rejects new connections.',
			'',
			'```sql',
			'SHOW VARIABLES LIKE "max_connections";',
			'```',
			'',
			'This **started after deployment**.'
		].join('\n');

		expect(parseIncidentDescription(description)).toEqual([
			{ type: 'heading', text: 'Observed behavior' },
			{ type: 'list', items: ['Eight replicas are active', 'Pool size is `25`'] },
			{ type: 'quote', text: 'MariaDB rejects new connections.' },
			{
				type: 'code',
				language: 'sql',
				text: 'SHOW VARIABLES LIKE "max_connections";'
			},
			{ type: 'paragraph', text: 'This **started after deployment**.' }
		]);
	});

	it('parses only supported inline emphasis without producing raw HTML', () => {
		expect(parseIncidentInline('Pool **maximum** is `25` <script>')).toEqual([
			{ type: 'text', text: 'Pool ' },
			{ type: 'strong', text: 'maximum' },
			{ type: 'text', text: ' is ' },
			{ type: 'code', text: '25' },
			{ type: 'text', text: ' <script>' }
		]);
	});

	it('replaces internal validation dumps with one user-facing limitation', () => {
		const result = userFacingLimitations([
			'ZodError: invalid_union at evidence[0]',
			'{"code":"unrecognized_keys","path":["evidence",0]}',
			'Grafana was not connected.'
		]);

		expect(result).toEqual([
			'The generated evidence references did not match the inspected sources.',
			'Grafana was not connected.'
		]);
		expect(result.join(' ')).not.toMatch(/zod|invalid_union|unrecognized_keys|evidence\[0\]/i);
	});

	it('bounds unusually long legacy limitations', () => {
		const [limitation] = userFacingLimitations(['x'.repeat(1_000)]);
		expect(limitation).toHaveLength(600);
		expect(limitation?.endsWith('…')).toBe(true);
	});
});
