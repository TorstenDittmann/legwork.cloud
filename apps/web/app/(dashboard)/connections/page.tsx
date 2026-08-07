import { eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, providerConnections } from "@oncall-ai/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/journal";
import { StatusMark } from "@/components/ui/status";
import { createConnection, testConnection, toggleConnection } from "./actions";

export default async function ConnectionsPage() {
	const tenant = await requireTenant();
	const connections = await createDatabase()
		.select()
		.from(providerConnections)
		.where(eq(providerConnections.organizationId, tenant.organizationId));
	return (
		<>
			<PageHeader
				eyebrow="Organization integrations"
				title="Connections"
				description="Read-only Grafana and Sentry context connections. Credentials are encrypted and never redisplayed."
			/>
			<div className="mt-8 grid gap-4 lg:grid-cols-2">
				{connections.map((connection) => (
					<Card key={connection.id}>
						<CardHeader>
							<CardTitle>{connection.name}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div className="flex items-center justify-between">
								<span className="capitalize">
									{connection.provider} · {connection.mode.replaceAll("_", " ")}
								</span>
								<StatusMark
									status={
										!connection.enabled
											? "disabled"
											: connection.lastVerifiedAt
												? "enabled"
												: "pending"
									}
								/>
							</div>
							<p className="text-[var(--ink-muted)]">{connection.baseUrl}</p>
							<p className="text-[var(--ink-muted)]">
								Capabilities: {connection.capabilities.join(", ") || "none"}
							</p>
							<p className="text-xs text-[var(--ink-faint)]">
								{connection.lastVerifiedAt
									? `Verified ${connection.lastVerifiedAt.toLocaleString()}`
									: (connection.lastVerificationError ?? "Not verified")}
							</p>
							{tenant.role === "admin" && (
								<div className="flex gap-2">
									<form action={testConnection}>
										<input type="hidden" name="id" value={connection.id} />
										<Button size="sm" variant="ghost">
											Test
										</Button>
									</form>
									<form action={toggleConnection}>
										<input type="hidden" name="id" value={connection.id} />
										<input type="hidden" name="enabled" value={String(!connection.enabled)} />
										<Button size="sm" variant="ghost">
											{connection.enabled ? "Disable" : "Enable"}
										</Button>
									</form>
								</div>
							)}
						</CardContent>
					</Card>
				))}
			</div>
			{tenant.role === "admin" && (
				<Card className="mt-8">
					<CardHeader>
						<CardTitle>Add connection</CardTitle>
					</CardHeader>
					<CardContent>
						<form action={createConnection} className="grid gap-4 md:grid-cols-2">
							<Field label="Provider" htmlFor="provider">
								<Select id="provider" name="provider">
									<option value="grafana">Grafana</option>
									<option value="sentry">Sentry</option>
								</Select>
							</Field>
							<Field label="Mode" htmlFor="mode">
								<Select id="mode" name="mode">
									<option value="grafana_cloud">Grafana Cloud</option>
									<option value="grafana_http">Self-hosted Grafana</option>
									<option value="sentry_cloud">Sentry Cloud</option>
									<option value="sentry_http">Self-hosted Sentry</option>
								</Select>
							</Field>
							<Field label="Name" htmlFor="connection-name">
								<Input id="connection-name" name="name" required />
							</Field>
							<Field label="HTTPS base URL" htmlFor="base-url">
								<Input
									id="base-url"
									name="baseUrl"
									type="url"
									defaultValue="https://sentry.io"
									required
								/>
							</Field>
							<Field label="API token" htmlFor="provider-token">
								<Input
									id="provider-token"
									name="token"
									type="password"
									autoComplete="new-password"
									required
								/>
							</Field>
							<Field label="Sentry organization slug" htmlFor="organization-slug">
								<Input id="organization-slug" name="organizationSlug" />
							</Field>
							<Field label="Sentry project slug" htmlFor="project-slug">
								<Input id="project-slug" name="projectSlug" />
							</Field>
							<Field label="Loki data-source UID" htmlFor="logs-uid">
								<Input id="logs-uid" name="logsUid" />
							</Field>
							<Field label="Prometheus data-source UID" htmlFor="metrics-uid">
								<Input id="metrics-uid" name="metricsUid" />
							</Field>
							<Field label="Tempo data-source UID" htmlFor="traces-uid">
								<Input id="traces-uid" name="tracesUid" />
							</Field>
							<div className="md:col-span-2">
								<Button type="submit">Save connection</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			)}
		</>
	);
}
