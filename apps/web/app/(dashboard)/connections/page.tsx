import { eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { createDatabase, providerConnections } from "@oncall-ai/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/journal";
import { StatusMark } from "@/components/ui/status";
import { AddConnectionForm } from "./add-connection-form";
import { testConnection, toggleConnection } from "./actions";

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
				description="Connect observability tools once, then choose which services can use their read-only context."
			/>
			{connections.length > 0 && (
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
								<p className="text-ink-muted">{connection.baseUrl}</p>
								<p className="text-ink-muted">
									Capabilities: {connection.capabilities.join(", ") || "none"}
								</p>
								<p className="text-xs text-ink-faint">
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
			)}
			{tenant.role === "admin" && <AddConnectionForm defaultOpen={connections.length === 0} />}
		</>
	);
}
