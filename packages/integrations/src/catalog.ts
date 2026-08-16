import { z } from "zod";
import {
	providerToolSchemas,
	type ModelToolDefinition,
	type ProviderCapability,
	type ProviderKind,
} from "@legwork/contracts";

const metadata = [
	["grafana_query_logs", "Query bounded Grafana logs around the incident", "grafana", "logs"],
	[
		"grafana_query_metrics",
		"Query bounded Grafana metrics around the incident",
		"grafana",
		"metrics",
	],
	[
		"grafana_query_traces",
		"Query bounded Grafana trace summaries around the incident",
		"grafana",
		"traces",
	],
	["sentry_get_issue", "Get the Sentry issue linked to this incident", "sentry", "issues"],
	["sentry_get_event", "Get a bounded Sentry event for the linked issue", "sentry", "events"],
	["sentry_list_events", "List bounded events for the linked Sentry issue", "sentry", "events"],
	[
		"sentry_get_release_commits",
		"List bounded commits for the linked Sentry release",
		"sentry",
		"releases",
	],
] as const;
export interface CatalogBinding {
	provider: ProviderKind;
	enabled: boolean;
	verified: boolean;
	capabilities: ProviderCapability[];
	allowedOperations?: string[];
}
export function providerToolDefinitions(bindings: CatalogBinding[]): ModelToolDefinition[] {
	return metadata.flatMap(([name, description, provider, capability], index) => {
		const available = bindings.some(
			(binding) =>
				binding.enabled &&
				binding.verified &&
				binding.provider === provider &&
				binding.capabilities.includes(capability) &&
				(!binding.allowedOperations || binding.allowedOperations.includes(name)),
		);
		return available
			? [
					{
						type: "function" as const,
						function: {
							name,
							description,
							parameters: z.toJSONSchema(providerToolSchemas[index]!),
						},
					},
				]
			: [];
	});
}
