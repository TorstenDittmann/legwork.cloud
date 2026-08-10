"use client";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createConnection, discoverConnection } from "./actions";
import type { ConnectionActionState, DiscoveryState } from "./state";

const errorMessages: Record<string, string> = {
	PROVIDER_URL_UNSAFE: "The URL must be public HTTPS without a port or embedded credentials.",
	PROVIDER_AUTHENTICATION_FAILED: "The provider rejected the token.",
	PROVIDER_PERMISSION_DENIED: "The token lacks the required read permissions.",
	PROVIDER_RATE_LIMITED: "The provider is rate limiting requests. Try again shortly.",
	PROVIDER_UNAVAILABLE: "The provider could not be reached.",
	PROVIDER_RESPONSE_INVALID: "The provider returned an unexpected response.",
	PROVIDER_QUERY_INVALID: "Check the provider, base URL, and token fields.",
};
function message(code: string) {
	return errorMessages[code] ?? code;
}

type Provider = "grafana" | "sentry";
const datasourceFields = [
	["logsUid", "loki", "Logs (Loki)"],
	["metricsUid", "prometheus", "Metrics (Prometheus)"],
	["tracesUid", "tempo", "Traces (Tempo)"],
] as const;

export function AddConnectionForm() {
	const [discovery, discover, discovering] = useActionState<DiscoveryState, FormData>(
		discoverConnection,
		{ status: "idle" },
	);
	const [saved, save, saving] = useActionState<ConnectionActionState, FormData>(createConnection, {
		status: "idle",
	});
	const [provider, setProvider] = useState<Provider>("grafana");
	const [name, setName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [token, setToken] = useState("");
	const [manual, setManual] = useState(false);
	const [datasources, setDatasources] = useState({ logsUid: "", metricsUid: "", tracesUid: "" });
	const [projectIndex, setProjectIndex] = useState(0);

	const discovered =
		discovery.status === "ok" && discovery.provider === provider ? discovery : null;
	useEffect(() => {
		if (!discovered) return;
		setManual(false);
		setProjectIndex(0);
		if (discovered.provider === "grafana")
			setDatasources({
				logsUid: discovered.datasources.find((item) => item.type === "loki")?.uid ?? "",
				metricsUid: discovered.datasources.find((item) => item.type === "prometheus")?.uid ?? "",
				tracesUid: discovered.datasources.find((item) => item.type === "tempo")?.uid ?? "",
			});
	}, [discovered]);
	useEffect(() => {
		if (saved.status !== "created" && saved.status !== "created_unverified") return;
		setName("");
		setBaseUrl("");
		setToken("");
		setDatasources({ logsUid: "", metricsUid: "", tracesUid: "" });
	}, [saved]);

	const project = discovered?.provider === "sentry" ? discovered.projects[projectIndex] : undefined;
	const ready = manual || Boolean(discovered);
	return (
		<Card className="mt-8">
			<CardHeader>
				<CardTitle>Add connection</CardTitle>
			</CardHeader>
			<CardContent>
				<form action={save} className="grid gap-4 md:grid-cols-2">
					<Field label="Provider" htmlFor="provider">
						<Select
							id="provider"
							name="provider"
							value={provider}
							onChange={(event) => setProvider(event.target.value as Provider)}
						>
							<option value="grafana">Grafana</option>
							<option value="sentry">Sentry</option>
						</Select>
					</Field>
					<Field label="Name" htmlFor="connection-name">
						<Input
							id="connection-name"
							name="name"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field
						label="HTTPS base URL"
						htmlFor="base-url"
						hint="Cloud or self-hosted is detected from the URL."
					>
						<Input
							id="base-url"
							name="baseUrl"
							type="url"
							placeholder={
								provider === "sentry" ? "https://sentry.io" : "https://example.grafana.net"
							}
							required
							value={baseUrl}
							onChange={(event) => setBaseUrl(event.target.value)}
						/>
					</Field>
					<Field label="API token" htmlFor="provider-token">
						<Input
							id="provider-token"
							name="token"
							type="password"
							autoComplete="new-password"
							required
							value={token}
							onChange={(event) => setToken(event.target.value)}
						/>
					</Field>
					{discovered?.provider === "grafana" &&
						datasourceFields.map(([field, type, label]) => {
							const options = discovered.datasources.filter((item) => item.type === type);
							return (
								<Field key={field} label={label} htmlFor={field}>
									<Select
										id={field}
										name={field}
										value={datasources[field]}
										onChange={(event) =>
											setDatasources((current) => ({ ...current, [field]: event.target.value }))
										}
									>
										<option value="">None</option>
										{options.map((item) => (
											<option key={item.uid} value={item.uid}>
												{item.name}
											</option>
										))}
									</Select>
								</Field>
							);
						})}
					{discovered?.provider === "sentry" && (
						<Field label="Project" htmlFor="sentry-project" className="md:col-span-2">
							<Select
								id="sentry-project"
								value={projectIndex}
								onChange={(event) => setProjectIndex(Number(event.target.value))}
							>
								{discovered.projects.map((item, index) => (
									<option key={`${item.organizationSlug}/${item.projectSlug}`} value={index}>
										{item.organizationSlug} / {item.name}
									</option>
								))}
							</Select>
							<input
								type="hidden"
								name="organizationSlug"
								value={project?.organizationSlug ?? ""}
							/>
							<input type="hidden" name="projectSlug" value={project?.projectSlug ?? ""} />
						</Field>
					)}
					{manual && !discovered && provider === "sentry" && (
						<>
							<Field label="Organization slug" htmlFor="organization-slug">
								<Input id="organization-slug" name="organizationSlug" required />
							</Field>
							<Field label="Project slug" htmlFor="project-slug">
								<Input id="project-slug" name="projectSlug" required />
							</Field>
						</>
					)}
					{manual && !discovered && provider === "grafana" && (
						<>
							<Field label="Loki data-source UID" htmlFor="logs-uid">
								<Input id="logs-uid" name="logsUid" />
							</Field>
							<Field label="Prometheus data-source UID" htmlFor="metrics-uid">
								<Input id="metrics-uid" name="metricsUid" />
							</Field>
							<Field label="Tempo data-source UID" htmlFor="traces-uid">
								<Input id="traces-uid" name="tracesUid" />
							</Field>
						</>
					)}
					<div className="flex flex-wrap items-center gap-3 md:col-span-2">
						<Button type="submit" formAction={discover} variant="ghost" disabled={discovering}>
							{discovering ? "Discovering…" : discovered ? "Rediscover" : "Discover"}
						</Button>
						<Button type="submit" disabled={!ready || saving}>
							{saving ? "Saving…" : "Save connection"}
						</Button>
						{!ready && (
							<button
								type="button"
								className="text-xs text-ink-muted underline underline-offset-2"
								onClick={() => setManual(true)}
							>
								Enter details manually
							</button>
						)}
					</div>
					<div className="space-y-1 text-xs md:col-span-2" aria-live="polite">
						{discovery.status === "error" && (
							<p className="text-danger">Discovery failed: {message(discovery.code)}</p>
						)}
						{discovered && discovered.provider === "grafana" && !discovered.datasources.length && (
							<p className="text-danger">
								No Loki, Prometheus, or Tempo data sources were found for this token.
							</p>
						)}
						{discovered && discovered.provider === "sentry" && !discovered.projects.length && (
							<p className="text-danger">No projects are visible to this token.</p>
						)}
						{saved.status === "error" && (
							<p className="text-danger">Could not save: {message(saved.code)}</p>
						)}
						{saved.status === "created" && (
							<p className="text-ink-muted">Connection saved and verified.</p>
						)}
						{saved.status === "created_unverified" && (
							<p className="text-danger">
								Connection saved, but verification failed: {message(saved.code)}
							</p>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
