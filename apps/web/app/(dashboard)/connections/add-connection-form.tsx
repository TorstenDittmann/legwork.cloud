"use client";

import {
	Activity,
	ArrowLeft,
	ArrowRight,
	Check,
	CheckCircle2,
	Database,
	Gauge,
	KeyRound,
	LoaderCircle,
	LockKeyhole,
	Plus,
	Server,
	ShieldCheck,
	Siren,
	Waypoints,
	X,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createConnection, discoverConnection } from "./actions";
import type { ConnectionActionState, DiscoveryState } from "./state";

const errorMessages: Record<string, string> = {
	PROVIDER_URL_UNSAFE: "Use a public HTTPS URL without a custom port or embedded credentials.",
	PROVIDER_AUTHENTICATION_FAILED: "The provider rejected this token. Check it and try again.",
	PROVIDER_PERMISSION_DENIED: "This token does not have the required read permissions.",
	PROVIDER_RATE_LIMITED: "The provider is rate limiting requests. Try again shortly.",
	PROVIDER_UNAVAILABLE: "The provider could not be reached from On-call AI.",
	PROVIDER_RESPONSE_INVALID: "The provider returned a response we could not understand.",
	PROVIDER_QUERY_INVALID: "Check the provider URL and token, then try again.",
};

function message(code: string) {
	return errorMessages[code] ?? code;
}

type Provider = "grafana" | "sentry";
type Step = 1 | 2 | 3;

const providers = {
	grafana: {
		name: "Grafana",
		description: "Investigate logs, metrics, and traces around an incident.",
		placeholder: "https://example.grafana.net",
		Icon: Gauge,
		credentialHint:
			"Create a service account token with Viewer access to the data sources you want to use.",
	},
	sentry: {
		name: "Sentry",
		description: "Inspect issues, events, releases, and commit context.",
		placeholder: "https://sentry.io",
		Icon: Siren,
		credentialHint:
			"Use an organization token with project:read, event:read, and org:read permissions.",
	},
} as const;

const datasourceFields = [
	["logsUid", "loki", "Logs", "Loki", Activity],
	["metricsUid", "prometheus", "Metrics", "Prometheus", Gauge],
	["tracesUid", "tempo", "Traces", "Tempo", Waypoints],
] as const;

const steps = [
	[1, "Provider", "Choose a source"],
	[2, "Connect", "Add credentials"],
	[3, "Configure", "Select context"],
] as const;

export function AddConnectionForm({ defaultOpen = false }: { defaultOpen?: boolean }) {
	const [discovery, discover, discovering] = useActionState<DiscoveryState, FormData>(
		discoverConnection,
		{ status: "idle" },
	);
	const [saved, save, saving] = useActionState<ConnectionActionState, FormData>(createConnection, {
		status: "idle",
	});
	const [step, setStep] = useState<Step>(1);
	const [provider, setProvider] = useState<Provider>("grafana");
	const [name, setName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [token, setToken] = useState("");
	const [manual, setManual] = useState(false);
	const [datasources, setDatasources] = useState({ logsUid: "", metricsUid: "", tracesUid: "" });
	const [projectIndex, setProjectIndex] = useState(0);
	const [dismissedComplete, setDismissedComplete] = useState(false);
	const [open, setOpen] = useState(defaultOpen);

	const discovered =
		discovery.status === "ok" && discovery.provider === provider ? discovery : null;
	const project = discovered?.provider === "sentry" ? discovered.projects[projectIndex] : undefined;
	const hasGrafanaSource = Object.values(datasources).some(Boolean);
	const canSave = manual || (provider === "grafana" ? hasGrafanaSource : Boolean(project));

	useEffect(() => {
		if (!discovered) return;
		setManual(false);
		setProjectIndex(0);
		setStep(3);
		if (discovered.provider === "grafana")
			setDatasources({
				logsUid: discovered.datasources.find((item) => item.type === "loki")?.uid ?? "",
				metricsUid: discovered.datasources.find((item) => item.type === "prometheus")?.uid ?? "",
				tracesUid: discovered.datasources.find((item) => item.type === "tempo")?.uid ?? "",
			});
	}, [discovered]);

	useEffect(() => {
		if (saved.status !== "created" && saved.status !== "created_unverified") return;
		setToken("");
	}, [saved]);

	function chooseProvider(next: Provider) {
		setProvider(next);
		setName(providers[next].name);
		setBaseUrl(next === "sentry" ? "https://sentry.io" : "");
		setManual(false);
		setStep(2);
	}

	function startOver() {
		setDismissedComplete(true);
		setStep(1);
		setName("");
		setBaseUrl("");
		setToken("");
		setManual(false);
		setDatasources({ logsUid: "", metricsUid: "", tracesUid: "" });
		setProjectIndex(0);
	}

	function closeWizard() {
		setOpen(false);
		setStep(1);
	}

	const ProviderIcon = providers[provider].Icon;
	const complete =
		!dismissedComplete && (saved.status === "created" || saved.status === "created_unverified");

	if (!open)
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="mt-8 flex w-full items-center justify-between rounded-[4px] border border-dashed border-rule-strong bg-surface/60 px-5 py-4 text-left transition hover:border-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
			>
				<span>
					<span className="block font-display font-semibold">Add a provider connection</span>
					<span className="mt-0.5 block text-sm text-ink-muted">
						Guided setup takes about two minutes.
					</span>
				</span>
				<span className="flex size-9 items-center justify-center rounded-[3px] bg-accent text-white">
					<Plus className="size-4" aria-hidden="true" />
				</span>
			</button>
		);

	return (
		<Card className="mt-10 overflow-hidden">
			<div className="border-b border-rule bg-surface-raised/60 px-6 py-5 md:px-8">
				<div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
					<div>
						<p className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
							Setup wizard
						</p>
						<h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em]">
							Add a context connection
						</h2>
						<p className="mt-1 text-sm text-ink-muted">
							Give investigations secure, read-only access to the signals they need.
						</p>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2 text-xs text-ink-muted">
							<LockKeyhole className="size-4 text-success" aria-hidden="true" />
							Credentials are encrypted
						</div>
						{!defaultOpen && (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={closeWizard}
								aria-label="Close setup wizard"
							>
								<X className="size-4" />
							</Button>
						)}
					</div>
				</div>
			</div>

			<div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
				<aside className="border-b border-rule bg-canvas/50 p-6 lg:border-r lg:border-b-0 lg:p-8">
					<ol
						className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-5"
						aria-label="Connection setup progress"
					>
						{steps.map(([number, label, detail]) => {
							const active = step === number;
							const done = step > number || complete;
							return (
								<li key={number} className="flex min-w-0 items-start gap-3">
									<span
										className={`flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] ${done ? "border-success bg-success text-white" : active ? "border-accent bg-accent text-white" : "border-rule-strong bg-surface text-ink-faint"}`}
									>
										{done ? <Check className="size-3.5" aria-hidden="true" /> : number}
									</span>
									<span className="min-w-0 pt-0.5">
										<span
											className={`block text-sm font-medium ${active ? "text-ink" : "text-ink-muted"}`}
										>
											{label}
										</span>
										<span className="mt-0.5 hidden text-xs text-ink-faint lg:block">{detail}</span>
									</span>
								</li>
							);
						})}
					</ol>
					<div className="mt-8 hidden border-t border-rule pt-6 text-xs leading-5 text-ink-faint lg:block">
						<ShieldCheck className="mb-3 size-5 text-success" aria-hidden="true" />
						Tokens are only decrypted when an investigation queries this provider.
					</div>
				</aside>

				<div className="min-w-0 p-6 md:p-8 lg:p-10">
					{complete ? (
						<div className="mx-auto max-w-lg py-8 text-center" aria-live="polite">
							<span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
								<CheckCircle2 className="size-7" aria-hidden="true" />
							</span>
							<h3 className="mt-5 font-display text-2xl font-semibold">Connection saved</h3>
							<p className="mt-2 text-sm leading-6 text-ink-muted">
								{saved.status === "created"
									? `${name} is verified and ready to bind to a service.`
									: `${name} was saved, but verification failed: ${message(saved.code)}`}
							</p>
							<Button type="button" variant="outline" className="mt-6" onClick={startOver}>
								Add another connection
							</Button>
							<Button type="button" variant="ghost" className="mt-6" onClick={closeWizard}>
								Done
							</Button>
						</div>
					) : step === 1 ? (
						<section>
							<h3 className="font-display text-xl font-semibold">
								Where should investigations look?
							</h3>
							<p className="mt-1 text-sm text-ink-muted">
								Choose the system that holds your operational context.
							</p>
							<div className="mt-6 grid gap-4 md:grid-cols-2">
								{(Object.keys(providers) as Provider[]).map((item) => {
									const option = providers[item];
									return (
										<button
											key={item}
											type="button"
											onClick={() => chooseProvider(item)}
											className="group rounded-[4px] border border-rule-strong bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_8px_24px_rgba(23,26,32,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
										>
											<span className="flex size-10 items-center justify-center rounded-[3px] bg-surface-raised text-accent group-hover:bg-accent group-hover:text-white">
												<option.Icon className="size-5" aria-hidden="true" />
											</span>
											<span className="mt-4 flex items-center justify-between font-display text-lg font-semibold">
												{option.name}
												<ArrowRight
													className="size-4 text-ink-faint group-hover:translate-x-0.5 group-hover:text-accent"
													aria-hidden="true"
												/>
											</span>
											<span className="mt-1 block text-sm leading-6 text-ink-muted">
												{option.description}
											</span>
										</button>
									);
								})}
							</div>
						</section>
					) : (
						<form
							action={save}
							className="max-w-2xl"
							onSubmit={() => {
								if (step === 3) setDismissedComplete(false);
							}}
						>
							<input type="hidden" name="provider" value={provider} />
							<div className="flex items-start gap-4">
								<span className="flex size-10 shrink-0 items-center justify-center rounded-[3px] bg-surface-raised text-accent">
									<ProviderIcon className="size-5" aria-hidden="true" />
								</span>
								<div>
									<h3 className="font-display text-xl font-semibold">
										{step === 2
											? `Connect ${providers[provider].name}`
											: "Choose investigation context"}
									</h3>
									<p className="mt-1 text-sm text-ink-muted">
										{step === 2
											? "We’ll verify access and discover what is available."
											: "Only selected resources will be available to the investigator."}
									</p>
								</div>
							</div>

							{step === 2 ? (
								<div className="mt-7 grid gap-5 md:grid-cols-2">
									<Field
										label="Connection name"
										htmlFor="connection-name"
										hint="A recognizable name for your team."
									>
										<Input
											id="connection-name"
											name="name"
											required
											value={name}
											placeholder={`${providers[provider].name} production`}
											onChange={(event) => setName(event.target.value)}
										/>
									</Field>
									<Field
										label="HTTPS base URL"
										htmlFor="base-url"
										hint="Cloud and self-hosted deployments are detected automatically."
									>
										<div className="relative">
											<Server
												className="pointer-events-none absolute top-3 left-3 size-4 text-ink-faint"
												aria-hidden="true"
											/>
											<Input
												className="pl-9"
												id="base-url"
												name="baseUrl"
												type="url"
												placeholder={providers[provider].placeholder}
												required
												value={baseUrl}
												onChange={(event) => setBaseUrl(event.target.value)}
											/>
										</div>
									</Field>
									<Field
										label="Read-only API token"
										htmlFor="provider-token"
										hint="Use the narrowest read permissions available."
										className="md:col-span-2"
									>
										<div className="relative">
											<KeyRound
												className="pointer-events-none absolute top-3 left-3 size-4 text-ink-faint"
												aria-hidden="true"
											/>
											<Input
												className="pl-9 font-mono"
												id="provider-token"
												name="token"
												type="password"
												autoComplete="new-password"
												required
												value={token}
												onChange={(event) => setToken(event.target.value)}
											/>
										</div>
										<p className="mt-2 rounded-[3px] bg-canvas px-3 py-2 text-xs leading-5 text-ink-muted">
											{providers[provider].credentialHint} The token is encrypted and never shown
											again.
										</p>
									</Field>
								</div>
							) : (
								<div className="mt-7 space-y-5">
									<input type="hidden" name="name" value={name} />
									<input type="hidden" name="baseUrl" value={baseUrl} />
									<input type="hidden" name="token" value={token} />
									<div className="rounded-[4px] border border-rule bg-canvas/50 p-4">
										<p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
											Connection summary
										</p>
										<p className="mt-1 text-sm font-medium">{name}</p>
										<p className="mt-0.5 break-all text-xs text-ink-muted">{baseUrl}</p>
									</div>
									{discovered?.provider === "grafana" &&
										datasourceFields.map(([field, type, label, technology, Icon]) => {
											const options = discovered.datasources.filter((item) => item.type === type);
											return (
												<div
													key={field}
													className="grid items-center gap-3 rounded-[4px] border border-rule bg-canvas/50 p-4 sm:grid-cols-[36px_1fr_minmax(180px,1fr)]"
												>
													<span className="flex size-9 items-center justify-center rounded-[3px] bg-surface text-accent">
														<Icon className="size-4" aria-hidden="true" />
													</span>
													<div>
														<p className="text-sm font-medium">{label}</p>
														<p className="text-xs text-ink-faint">{technology} data source</p>
													</div>
													<Select
														aria-label={`${label} data source`}
														name={field}
														value={datasources[field]}
														onChange={(event) =>
															setDatasources((current) => ({
																...current,
																[field]: event.target.value,
															}))
														}
													>
														<option value="">Do not include</option>
														{options.map((item) => (
															<option key={item.uid} value={item.uid}>
																{item.name}
															</option>
														))}
													</Select>
												</div>
											);
										})}
									{discovered?.provider === "sentry" && (
										<Field
											label="Sentry project"
											htmlFor="sentry-project"
											hint={`${discovered.projects.length} project${discovered.projects.length === 1 ? "" : "s"} available to this token.`}
										>
											<Select
												id="sentry-project"
												value={projectIndex}
												onChange={(event) => setProjectIndex(Number(event.target.value))}
											>
												{discovered.projects.map((item, index) => (
													<option
														key={`${item.organizationSlug}/${item.projectSlug}`}
														value={index}
													>
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
									{manual && provider === "sentry" && (
										<div className="grid gap-4 md:grid-cols-2">
											<Field label="Organization slug" htmlFor="organization-slug">
												<Input id="organization-slug" name="organizationSlug" required />
											</Field>
											<Field label="Project slug" htmlFor="project-slug">
												<Input id="project-slug" name="projectSlug" required />
											</Field>
										</div>
									)}
									{manual && provider === "grafana" && (
										<div className="grid gap-4 md:grid-cols-3">
											<Field label="Loki UID" htmlFor="logs-uid">
												<Input id="logs-uid" name="logsUid" />
											</Field>
											<Field label="Prometheus UID" htmlFor="metrics-uid">
												<Input id="metrics-uid" name="metricsUid" />
											</Field>
											<Field label="Tempo UID" htmlFor="traces-uid">
												<Input id="traces-uid" name="tracesUid" />
											</Field>
										</div>
									)}
									<div className="flex items-start gap-3 rounded-[4px] border border-success/25 bg-success/5 p-4 text-sm text-ink-muted">
										<Database className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
										<p>
											Queries are read-only, scoped to incidents, and limited to the capabilities
											selected here.
										</p>
									</div>
								</div>
							)}

							<div className="mt-7 min-h-6 text-sm" aria-live="polite">
								{discovery.status === "error" && (
									<p className="text-danger">{message(discovery.code)}</p>
								)}
								{saved.status === "error" && (
									<p className="text-danger">Could not save: {message(saved.code)}</p>
								)}
								{step === 3 &&
									discovered?.provider === "grafana" &&
									!discovered.datasources.length && (
										<p className="text-danger">
											No supported data sources were found for this token.
										</p>
									)}
								{step === 3 && discovered?.provider === "sentry" && !discovered.projects.length && (
									<p className="text-danger">No projects are visible to this token.</p>
								)}
							</div>

							<div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
								<Button type="button" variant="ghost" onClick={() => setStep(step === 2 ? 1 : 2)}>
									<ArrowLeft className="size-4" />
									Back
								</Button>
								<div className="flex flex-wrap items-center justify-end gap-3">
									{step === 2 && (
										<button
											type="button"
											className="text-xs text-ink-muted underline underline-offset-4 hover:text-ink"
											onClick={() => {
												setManual(true);
												setStep(3);
											}}
										>
											Set up manually instead
										</button>
									)}
									{step === 2 ? (
										<Button
											type="submit"
											formAction={discover}
											disabled={discovering || !name || !baseUrl || !token}
										>
											{discovering ? (
												<>
													<LoaderCircle className="size-4 animate-spin" />
													Discovering…
												</>
											) : (
												<>
													Discover resources
													<ArrowRight className="size-4" />
												</>
											)}
										</Button>
									) : (
										<Button type="submit" disabled={!canSave || saving}>
											{saving ? (
												<>
													<LoaderCircle className="size-4 animate-spin" />
													Verifying…
												</>
											) : (
												<>
													Save &amp; verify
													<ShieldCheck className="size-4" />
												</>
											)}
										</Button>
									)}
								</div>
							</div>
						</form>
					)}
				</div>
			</div>
		</Card>
	);
}
