"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	bindProviderConnection,
	createAlertIntegration,
	type IntegrationSetupState,
} from "./provider-actions";

export function ProviderSetup({
	serviceId,
	connections,
}: {
	serviceId: string;
	connections: Array<{ id: string; name: string; provider: string }>;
}) {
	const [state, action, pending] = useActionState(
		createAlertIntegration,
		{} as IntegrationSetupState,
	);
	return (
		<div className="grid gap-6 md:grid-cols-2">
			<form action={action} className="space-y-3">
				<input type="hidden" name="serviceId" value={serviceId} />
				<Field label="Alert provider" htmlFor="alert-provider">
					<Select id="alert-provider" name="provider">
						<option value="grafana">Grafana Alerting / IRM</option>
						<option value="sentry">Sentry Internal Integration</option>
					</Select>
				</Field>
				<Field label="Integration name" htmlFor="integration-name">
					<Input id="integration-name" name="name" required />
				</Field>
				<Button disabled={pending}>{pending ? "Creating…" : "Create webhook"}</Button>
				{state.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
				{state.webhookUrl && (
					<div className="border border-[var(--rule)] p-3 text-xs">
						<p className="font-semibold">Copy these now. The secret will not be shown again.</p>
						<p className="mt-2 break-all font-mono">URL: {state.webhookUrl}</p>
						<p className="mt-2 break-all font-mono">Secret: {state.secret}</p>
					</div>
				)}
			</form>
			<form action={bindProviderConnection} className="space-y-3">
				<input type="hidden" name="serviceId" value={serviceId} />
				<Field label="Context connection" htmlFor="connection-id">
					<Select id="connection-id" name="connectionId" required>
						<option value="">Select a verified connection…</option>
						{connections.map((connection) => (
							<option key={connection.id} value={connection.id}>
								{connection.name} · {connection.provider}
							</option>
						))}
					</Select>
				</Field>
				<p className="text-xs text-[var(--ink-muted)]">
					Binding enables only the connection’s verified read capabilities. One enabled connection
					per provider is retained.
				</p>
				<Button type="submit" disabled={!connections.length}>
					Bind connection
				</Button>
			</form>
		</div>
	);
}
