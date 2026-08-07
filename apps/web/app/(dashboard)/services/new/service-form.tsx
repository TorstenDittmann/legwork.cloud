"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/journal";

export function ServiceForm({
	repositories,
}: {
	repositories: Array<{ id: string; fullName: string }>;
}) {
	const router = useRouter();
	const [revealed, setRevealed] = useState<{
		ingestionKey: string;
		callbackSigningSecret: string;
	} | null>(null);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const [copied, setCopied] = useState("");
	async function copy(label: string, value: string) {
		await navigator.clipboard.writeText(value);
		setCopied(label);
	}
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setError("");
		setPending(true);
		const response = await fetch("/api/services", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				name: form.get("name"),
				slug: form.get("slug"),
				primaryRepositoryId: form.get("primaryRepositoryId"),
				relatedRepositoryIds: form.getAll("relatedRepositoryIds").filter(Boolean),
				callbackUrl: form.get("callbackUrl") || undefined,
				enabled: true,
			}),
		});
		const body = await response.json();
		if (!response.ok) {
			setError(body.detail ?? "Unable to create service");
			setPending(false);
			return;
		}
		setRevealed({
			ingestionKey: body.ingestionKey,
			callbackSigningSecret: body.callbackSigningSecret,
		});
		router.refresh();
	}
	if (revealed) {
		const secrets: Array<[string, string]> = [
			["Ingestion Key", revealed.ingestionKey],
			["Callback Secret", revealed.callbackSigningSecret],
		];
		return (
			<div className="max-w-2xl border-l-2 border-[var(--warning)] bg-[var(--surface)] p-6">
				<h2 className="font-display text-2xl text-[var(--ink)]">Copy These Secrets Now</h2>
				<p className="mt-2 text-sm text-[var(--warning)]">They will not be shown again.</p>
				<div className="mt-5 space-y-3">
					{secrets.map(([label, value]) => (
						<div key={label} className="border border-[var(--rule)] bg-[var(--canvas)] p-4">
							<p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
								{label}
							</p>
							<code
								translate="no"
								className="mt-2 block overflow-x-auto text-xs text-[var(--ink-muted)]"
							>
								{value}
							</code>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="mt-2"
								onClick={() => copy(label, value)}
							>
								{copied === label ? "Copied" : `Copy ${label}`}
							</Button>
						</div>
					))}
				</div>
				<p aria-live="polite" className="sr-only">
					{copied ? `${copied} copied` : ""}
				</p>
				<Button className="mt-5" onClick={() => router.push("/services")}>
					Open Services
				</Button>
			</div>
		);
	}
	return (
		<form onSubmit={submit} className="max-w-2xl space-y-5">
			<Field label="Name" htmlFor="name">
				<Input id="name" name="name" autoComplete="off" required />
			</Field>
			<Field
				label="Slug"
				htmlFor="slug"
				hint="Stable lowercase identifier used by the ingestion endpoint."
			>
				<Input
					id="slug"
					name="slug"
					autoComplete="off"
					spellCheck={false}
					required
					pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
				/>
			</Field>
			<Field label="Primary Repository" htmlFor="primaryRepositoryId">
				<Select id="primaryRepositoryId" name="primaryRepositoryId" required>
					{repositories.map((repository) => (
						<option key={repository.id} value={repository.id}>
							{repository.fullName}
						</option>
					))}
				</Select>
			</Field>
			<fieldset>
				<legend className="text-xs font-medium">
					Related Repositories <span className="text-[var(--ink-faint)]">(up to 2)</span>
				</legend>
				<div className="mt-2 grid gap-px border border-[var(--rule)] bg-[var(--rule)]">
					{repositories.map((repository) => (
						<label
							key={repository.id}
							className="flex min-h-10 items-center gap-3 bg-[var(--canvas)] px-3 text-sm"
						>
							<input
								type="checkbox"
								name="relatedRepositoryIds"
								value={repository.id}
								className="size-4 accent-[var(--accent)]"
							/>
							<span translate="no" className="min-w-0 truncate">
								{repository.fullName}
							</span>
						</label>
					))}
				</div>
			</fieldset>
			<Field
				label="Callback HTTPS URL"
				htmlFor="callbackUrl"
				hint="Optional delivery target for completed diagnoses."
			>
				<Input
					id="callbackUrl"
					name="callbackUrl"
					type="url"
					autoComplete="url"
					placeholder="https://ops.example.com/incidents…"
				/>
			</Field>
			{error && <InlineAlert tone="danger">{error}</InlineAlert>}
			<Button type="submit" disabled={pending}>
				{pending ? "Creating Service…" : "Create Service & Reveal Keys"}
			</Button>
		</form>
	);
}
