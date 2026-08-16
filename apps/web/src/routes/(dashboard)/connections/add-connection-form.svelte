<script lang="ts">
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
		X
	} from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import Field from '$lib/components/ui/field.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Select from '$lib/components/ui/select.svelte';
	import type { ConnectionActionState, DiscoveryState } from './state';

	let { defaultOpen = false }: { defaultOpen?: boolean } = $props();

	const errorMessages: Record<string, string> = {
		PROVIDER_URL_UNSAFE: 'Use a public HTTPS URL without a custom port or embedded credentials.',
		PROVIDER_AUTHENTICATION_FAILED: 'The provider rejected this token. Check it and try again.',
		PROVIDER_PERMISSION_DENIED: 'This token does not have the required read permissions.',
		PROVIDER_RATE_LIMITED: 'The provider is rate limiting requests. Try again shortly.',
		PROVIDER_UNAVAILABLE: 'The provider could not be reached from Legwork.',
		PROVIDER_RESPONSE_INVALID: 'The provider returned a response we could not understand.',
		PROVIDER_QUERY_INVALID: 'Check the provider URL and token, then try again.'
	};

	function message(code: string) {
		return errorMessages[code] ?? code;
	}

	type Provider = 'grafana' | 'sentry';
	type Step = 1 | 2 | 3;

	const providers = {
		grafana: {
			name: 'Grafana',
			description: 'Investigate logs, metrics, and traces around an incident.',
			placeholder: 'https://example.grafana.net',
			Icon: Gauge,
			credentialHint:
				'Create a service account token with Viewer access to the data sources you want to use.'
		},
		sentry: {
			name: 'Sentry',
			description: 'Inspect issues, events, releases, and commit context.',
			placeholder: 'https://sentry.io',
			Icon: Siren,
			credentialHint:
				'Use an organization token with project:read, event:read, and org:read permissions.'
		}
	} as const;
	const providerKeys = Object.keys(providers) as Provider[];

	const datasourceFields = [
		['logsUid', 'loki', 'Logs', 'Loki', Activity],
		['metricsUid', 'prometheus', 'Metrics', 'Prometheus', Gauge],
		['tracesUid', 'tempo', 'Traces', 'Tempo', Waypoints]
	] as const;

	const steps = [
		[1, 'Provider', 'Choose a source'],
		[2, 'Connect', 'Add credentials'],
		[3, 'Configure', 'Select context']
	] as const;

	let discovery = $state<DiscoveryState>({ status: 'idle' });
	let saved = $state<ConnectionActionState>({ status: 'idle' });
	let discovering = $state(false);
	let saving = $state(false);
	let step = $state<Step>(1);
	let provider = $state<Provider>('grafana');
	let name = $state('');
	let baseUrl = $state('');
	let token = $state('');
	let manual = $state(false);
	let datasources = $state({ logsUid: '', metricsUid: '', tracesUid: '' });
	let projectIndex = $state(0);
	let dismissedComplete = $state(false);
	// Matches the React source: `defaultOpen` only seeds the initial open state.
	// svelte-ignore state_referenced_locally
	let open = $state(defaultOpen);

	const discovered = $derived(
		discovery.status === 'ok' && discovery.provider === provider ? discovery : null
	);
	const project = $derived(
		discovered?.provider === 'sentry' ? discovered.projects[projectIndex] : undefined
	);
	const hasGrafanaSource = $derived(Object.values(datasources).some(Boolean));
	const canSave = $derived(
		manual || (provider === 'grafana' ? hasGrafanaSource : Boolean(project))
	);
	const ProviderIcon = $derived(providers[provider].Icon);
	const complete = $derived(
		!dismissedComplete && (saved.status === 'created' || saved.status === 'created_unverified')
	);

	function applyDiscovery(next: DiscoveryState) {
		discovery = next;
		if (next.status !== 'ok' || next.provider !== provider) return;
		manual = false;
		projectIndex = 0;
		step = 3;
		if (next.provider === 'grafana')
			datasources = {
				logsUid: next.datasources.find((item) => item.type === 'loki')?.uid ?? '',
				metricsUid: next.datasources.find((item) => item.type === 'prometheus')?.uid ?? '',
				tracesUid: next.datasources.find((item) => item.type === 'tempo')?.uid ?? ''
			};
	}

	function applySaved(next: ConnectionActionState) {
		saved = next;
		if (next.status === 'created' || next.status === 'created_unverified') token = '';
	}

	function chooseProvider(next: Provider) {
		provider = next;
		name = providers[next].name;
		baseUrl = next === 'sentry' ? 'https://sentry.io' : '';
		manual = false;
		step = 2;
	}

	function startOver() {
		dismissedComplete = true;
		step = 1;
		name = '';
		baseUrl = '';
		token = '';
		manual = false;
		datasources = { logsUid: '', metricsUid: '', tracesUid: '' };
		projectIndex = 0;
	}

	function closeWizard() {
		open = false;
		step = 1;
	}
</script>

{#if !open}
	<button
		type="button"
		onclick={() => (open = true)}
		class="mt-8 flex w-full items-center justify-between rounded-xl border border-dashed border-rule-strong bg-surface/60 px-5 py-4 text-left transition hover:border-accent hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
	>
		<span>
			<span class="block font-display text-lg font-semibold">Add a provider connection</span>
			<span class="mt-0.5 block text-sm text-ink-muted">
				Guided setup takes about two minutes.
			</span>
		</span>
		<span class="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
			<Plus class="size-4" aria-hidden="true" />
		</span>
	</button>
{:else}
	<Card class="mt-10 overflow-hidden">
		<div class="border-b border-rule bg-surface-raised/60 px-6 py-5 md:px-8">
			<div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
				<div>
					<p class="text-sm font-medium text-accent">Setup wizard</p>
					<h2 class="mt-1 font-display text-2xl font-semibold tracking-[-0.01em]">
						Add a context connection
					</h2>
					<p class="mt-1 text-sm text-ink-muted">
						Give investigations secure, read-only access to the signals they need.
					</p>
				</div>
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2 text-xs text-ink-muted">
						<LockKeyhole class="size-4 text-success" aria-hidden="true" />
						Credentials are encrypted
					</div>
					{#if !defaultOpen}
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onclick={closeWizard}
							aria-label="Close setup wizard"
						>
							<X class="size-4" />
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<div class="grid lg:grid-cols-[240px_minmax(0,1fr)]">
			<aside class="border-b border-rule bg-canvas/50 p-6 lg:border-r lg:border-b-0 lg:p-8">
				<ol
					class="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-5"
					aria-label="Connection setup progress"
				>
					{#each steps as [number, label, detail] (number)}
						{@const active = step === number}
						{@const done = step > number || complete}
						<li class="flex min-w-0 items-start gap-3">
							<span
								class={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${done ? 'border-success bg-success text-white' : active ? 'border-accent bg-accent text-white' : 'border-rule-strong bg-surface text-ink-faint'}`}
							>
								{#if done}
									<Check class="size-3.5" aria-hidden="true" />
								{:else}
									{number}
								{/if}
							</span>
							<span class="min-w-0 pt-0.5">
								<span class={`block text-sm font-medium ${active ? 'text-ink' : 'text-ink-muted'}`}>
									{label}
								</span>
								<span class="mt-0.5 hidden text-xs text-ink-faint lg:block">{detail}</span>
							</span>
						</li>
					{/each}
				</ol>
				<div
					class="mt-8 hidden border-t border-rule pt-6 text-xs leading-5 text-ink-faint lg:block"
				>
					<ShieldCheck class="mb-3 size-5 text-success" aria-hidden="true" />
					Tokens are only decrypted when an investigation queries this provider.
				</div>
			</aside>

			<div class="min-w-0 p-6 md:p-8 lg:p-10">
				{#if complete}
					<div class="mx-auto max-w-lg py-8 text-center" aria-live="polite">
						<span
							class="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success"
						>
							<CheckCircle2 class="size-7" aria-hidden="true" />
						</span>
						<h3 class="mt-5 font-display text-2xl font-semibold">Connection saved</h3>
						<p class="mt-2 text-sm leading-6 text-ink-muted">
							{#if saved.status === 'created'}
								{`${name} is verified and ready to bind to a service.`}
							{:else if saved.status === 'created_unverified'}
								{`${name} was saved, but verification failed: ${message(saved.code)}`}
							{/if}
						</p>
						<Button type="button" variant="outline" class="mt-6" onclick={startOver}>
							Add another connection
						</Button>
						<Button type="button" variant="ghost" class="mt-6" onclick={closeWizard}>Done</Button>
					</div>
				{:else if step === 1}
					<section>
						<h3 class="font-display text-xl font-semibold">Where should investigations look?</h3>
						<p class="mt-1 text-sm text-ink-muted">
							Choose the system that holds your operational context.
						</p>
						<div class="mt-6 grid gap-4 md:grid-cols-2">
							{#each providerKeys as item (item)}
								{@const option = providers[item]}
								<button
									type="button"
									onclick={() => chooseProvider(item)}
									class="group rounded-xl border border-rule-strong bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lift focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
								>
									<span
										class="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-white"
									>
										<option.Icon class="size-5" aria-hidden="true" />
									</span>
									<span
										class="mt-4 flex items-center justify-between font-display text-lg font-semibold"
									>
										{option.name}
										<ArrowRight
											class="size-4 text-ink-faint group-hover:translate-x-0.5 group-hover:text-accent"
											aria-hidden="true"
										/>
									</span>
									<span class="mt-1 block text-sm leading-6 text-ink-muted">
										{option.description}
									</span>
								</button>
							{/each}
						</div>
					</section>
				{:else}
					<form
						method="POST"
						action="?/createConnection"
						class="max-w-2xl"
						use:enhance={({ action }) => {
							const isDiscover = action.search === '?/discoverConnection';
							if (isDiscover) {
								discovering = true;
							} else {
								saving = true;
								if (step === 3) dismissedComplete = false;
							}
							return async ({ result, update }) => {
								discovering = false;
								saving = false;
								if (result.type === 'success' || result.type === 'failure') {
									const payload = result.data as
										{ discovery?: DiscoveryState; saved?: ConnectionActionState } | undefined;
									if (payload?.discovery) applyDiscovery(payload.discovery);
									if (payload?.saved) applySaved(payload.saved);
								}
								if (!isDiscover) await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="provider" value={provider} />
						<div class="flex items-start gap-4">
							<span
								class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
							>
								<ProviderIcon class="size-5" aria-hidden="true" />
							</span>
							<div>
								<h3 class="font-display text-xl font-semibold">
									{step === 2
										? `Connect ${providers[provider].name}`
										: 'Choose investigation context'}
								</h3>
								<p class="mt-1 text-sm text-ink-muted">
									{step === 2
										? 'We’ll verify access and discover what is available.'
										: 'Only selected resources will be available to the investigator.'}
								</p>
							</div>
						</div>

						{#if step === 2}
							<div class="mt-7 grid gap-5 md:grid-cols-2">
								<Field
									label="Connection name"
									forId="connection-name"
									hint="A recognizable name for your team."
								>
									<Input
										id="connection-name"
										name="name"
										required
										placeholder={`${providers[provider].name} production`}
										bind:value={name}
									/>
								</Field>
								<Field
									label="HTTPS base URL"
									forId="base-url"
									hint="Cloud and self-hosted deployments are detected automatically."
								>
									<div class="relative">
										<Server
											class="pointer-events-none absolute top-3 left-3 size-4 text-ink-faint"
											aria-hidden="true"
										/>
										<Input
											class="pl-9"
											id="base-url"
											name="baseUrl"
											type="url"
											placeholder={providers[provider].placeholder}
											required
											bind:value={baseUrl}
										/>
									</div>
								</Field>
								<Field
									label="Read-only API token"
									forId="provider-token"
									hint="Use the narrowest read permissions available."
									class="md:col-span-2"
								>
									<div class="relative">
										<KeyRound
											class="pointer-events-none absolute top-3 left-3 size-4 text-ink-faint"
											aria-hidden="true"
										/>
										<Input
											class="pl-9 font-mono"
											id="provider-token"
											name="token"
											type="password"
											autocomplete="new-password"
											required
											bind:value={token}
										/>
									</div>
									<p
										class="mt-2 rounded-lg bg-surface-raised px-3 py-2 text-xs leading-5 text-ink-muted"
									>
										{providers[provider].credentialHint} The token is encrypted and never shown again.
									</p>
								</Field>
							</div>
						{:else}
							<div class="mt-7 space-y-5">
								<input type="hidden" name="name" value={name} />
								<input type="hidden" name="baseUrl" value={baseUrl} />
								<input type="hidden" name="token" value={token} />
								<div class="rounded-lg border border-rule bg-surface-raised/60 p-4">
									<p class="text-xs font-medium text-ink-faint">Connection summary</p>
									<p class="mt-1 text-sm font-medium">{name}</p>
									<p class="mt-0.5 text-xs break-all text-ink-muted">{baseUrl}</p>
								</div>
								{#if discovered?.provider === 'grafana'}
									{#each datasourceFields as [field, type, label, technology, Icon] (field)}
										{@const options = discovered.datasources.filter((item) => item.type === type)}
										<div
											class="grid items-center gap-3 rounded-lg border border-rule bg-surface-raised/60 p-4 sm:grid-cols-[36px_1fr_minmax(180px,1fr)]"
										>
											<span
												class="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent"
											>
												<Icon class="size-4" aria-hidden="true" />
											</span>
											<div>
												<p class="text-sm font-medium">{label}</p>
												<p class="text-xs text-ink-faint">{technology} data source</p>
											</div>
											<Select
												aria-label={`${label} data source`}
												name={field}
												bind:value={datasources[field]}
											>
												<option value="">Do not include</option>
												{#each options as item (item.uid)}
													<option value={item.uid}>{item.name}</option>
												{/each}
											</Select>
										</div>
									{/each}
								{/if}
								{#if discovered?.provider === 'sentry'}
									<Field
										label="Sentry project"
										forId="sentry-project"
										hint={`${discovered.projects.length} project${discovered.projects.length === 1 ? '' : 's'} available to this token.`}
									>
										<Select
											id="sentry-project"
											value={String(projectIndex)}
											onchange={(event) => (projectIndex = Number(event.currentTarget.value))}
										>
											{#each discovered.projects as item, index (`${item.organizationSlug}/${item.projectSlug}`)}
												<option value={index}>
													{item.organizationSlug} / {item.name}
												</option>
											{/each}
										</Select>
										<input
											type="hidden"
											name="organizationSlug"
											value={project?.organizationSlug ?? ''}
										/>
										<input type="hidden" name="projectSlug" value={project?.projectSlug ?? ''} />
									</Field>
								{/if}
								{#if manual && provider === 'sentry'}
									<div class="grid gap-4 md:grid-cols-2">
										<Field label="Organization slug" forId="organization-slug">
											<Input id="organization-slug" name="organizationSlug" required />
										</Field>
										<Field label="Project slug" forId="project-slug">
											<Input id="project-slug" name="projectSlug" required />
										</Field>
									</div>
								{/if}
								{#if manual && provider === 'grafana'}
									<div class="grid gap-4 md:grid-cols-3">
										<Field label="Loki UID" forId="logs-uid">
											<Input id="logs-uid" name="logsUid" />
										</Field>
										<Field label="Prometheus UID" forId="metrics-uid">
											<Input id="metrics-uid" name="metricsUid" />
										</Field>
										<Field label="Tempo UID" forId="traces-uid">
											<Input id="traces-uid" name="tracesUid" />
										</Field>
									</div>
								{/if}
								<div
									class="flex items-start gap-3 rounded-lg bg-success/10 p-4 text-sm text-ink-muted"
								>
									<Database class="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
									<p>
										Queries are read-only, scoped to incidents, and limited to the capabilities
										selected here.
									</p>
								</div>
							</div>
						{/if}

						<div class="mt-7 min-h-6 text-sm" aria-live="polite">
							{#if discovery.status === 'error'}
								<p class="text-danger">{message(discovery.code)}</p>
							{/if}
							{#if saved.status === 'error'}
								<p class="text-danger">Could not save: {message(saved.code)}</p>
							{/if}
							{#if step === 3 && discovered?.provider === 'grafana' && !discovered.datasources.length}
								<p class="text-danger">No supported data sources were found for this token.</p>
							{/if}
							{#if step === 3 && discovered?.provider === 'sentry' && !discovered.projects.length}
								<p class="text-danger">No projects are visible to this token.</p>
							{/if}
						</div>

						<div
							class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5"
						>
							<Button type="button" variant="ghost" onclick={() => (step = step === 2 ? 1 : 2)}>
								<ArrowLeft class="size-4" />
								Back
							</Button>
							<div class="flex flex-wrap items-center justify-end gap-3">
								{#if step === 2}
									<button
										type="button"
										class="text-xs text-ink-muted underline underline-offset-4 hover:text-ink"
										onclick={() => {
											manual = true;
											step = 3;
										}}
									>
										Set up manually instead
									</button>
								{/if}
								{#if step === 2}
									<Button
										type="submit"
										formaction="?/discoverConnection"
										disabled={discovering || !name || !baseUrl || !token}
									>
										{#if discovering}
											<LoaderCircle class="size-4 animate-spin" />
											Discovering…
										{:else}
											Discover resources
											<ArrowRight class="size-4" />
										{/if}
									</Button>
								{:else}
									<Button type="submit" disabled={!canSave || saving}>
										{#if saving}
											<LoaderCircle class="size-4 animate-spin" />
											Verifying…
										{:else}
											Save &amp; verify
											<ShieldCheck class="size-4" />
										{/if}
									</Button>
								{/if}
							</div>
						</div>
					</form>
				{/if}
			</div>
		</div>
	</Card>
{/if}
