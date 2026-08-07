"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function RepositoryToggle({ id, initial }: { id: string; initial: boolean }) {
	const [selected, setSelected] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	return (
		<div className="text-right">
			<Button
				size="sm"
				variant={selected ? "default" : "outline"}
				disabled={busy}
				onClick={async () => {
					setBusy(true);
					setMessage("");
					const response = await fetch(`/api/repositories/${id}`, {
						method: "PATCH",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ selected: !selected }),
					});
					if (response.ok) {
						setSelected(!selected);
						setMessage(!selected ? "Repository included." : "Repository excluded.");
					} else setMessage("Unable to update repository. Try again.");
					setBusy(false);
				}}
			>
				{busy ? "Updating…" : selected ? "Exclude Repository" : "Include Repository"}
			</Button>
			<p
				aria-live="polite"
				className={`mt-1 text-[10px] ${message.startsWith("Unable") ? "text-[var(--danger)]" : "text-[var(--ink-faint)]"}`}
			>
				{message}
			</p>
		</div>
	);
}
