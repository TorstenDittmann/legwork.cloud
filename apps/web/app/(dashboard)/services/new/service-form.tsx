"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setError("");
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
			return;
		}
		setRevealed({
			ingestionKey: body.ingestionKey,
			callbackSigningSecret: body.callbackSigningSecret,
		});
		router.refresh();
	}
	if (revealed)
		return (
			<div className="rounded-xl border border-amber-700 bg-amber-950/20 p-6">
				<h2 className="font-medium text-amber-200">Copy these secrets now</h2>
				<p className="mt-2 text-sm text-amber-300/70">They will not be shown again.</p>
				<pre className="mt-5 overflow-x-auto rounded bg-slate-950 p-4 text-xs text-slate-200">
					Ingestion key: {revealed.ingestionKey}
					{"\n"}Callback secret: {revealed.callbackSigningSecret}
				</pre>
				<Button className="mt-5" onClick={() => router.push("/services")}>
					Done
				</Button>
			</div>
		);
	return (
		<form onSubmit={submit} className="max-w-2xl space-y-5">
			<label className="block text-sm">
				Name
				<Input name="name" required className="mt-2" />
			</label>
			<label className="block text-sm">
				Slug
				<Input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className="mt-2" />
			</label>
			<label className="block text-sm">
				Primary repository
				<select
					name="primaryRepositoryId"
					required
					className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3"
				>
					{repositories.map((repository) => (
						<option key={repository.id} value={repository.id}>
							{repository.fullName}
						</option>
					))}
				</select>
			</label>
			<label className="block text-sm">
				Related repositories (up to two)
				<select
					name="relatedRepositoryIds"
					multiple
					size={Math.min(5, repositories.length)}
					className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 p-3"
				>
					{repositories.map((repository) => (
						<option key={repository.id} value={repository.id}>
							{repository.fullName}
						</option>
					))}
				</select>
			</label>
			<label className="block text-sm">
				Callback HTTPS URL (optional)
				<Input name="callbackUrl" type="url" className="mt-2" />
			</label>
			{error && <p className="text-sm text-red-400">{error}</p>}
			<Button type="submit">Create and reveal keys</Button>
		</form>
	);
}
