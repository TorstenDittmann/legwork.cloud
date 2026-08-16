import type { DiscoveredGrafanaDatasource, DiscoveredSentryProject } from '@oncall-ai/integrations';

export type DiscoveryState =
	| { status: 'idle' }
	| { status: 'error'; code: string }
	| { status: 'ok'; provider: 'grafana'; datasources: DiscoveredGrafanaDatasource[] }
	| { status: 'ok'; provider: 'sentry'; projects: DiscoveredSentryProject[] };

export type ConnectionActionState =
	| { status: 'idle' }
	| { status: 'error'; code: string }
	| { status: 'created' }
	| { status: 'created_unverified'; code: string };
