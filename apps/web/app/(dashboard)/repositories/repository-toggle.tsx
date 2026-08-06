"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function RepositoryToggle({ id, initial }: { id: string; initial: boolean }) {
	const [selected, setSelected] = useState(initial);
	const [busy, setBusy] = useState(false);
	return (
		<Button
			size="sm"
			variant={selected ? "default" : "outline"}
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				const response = await fetch(`/api/repositories/${id}`, {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ selected: !selected }),
				});
				if (response.ok) setSelected(!selected);
				setBusy(false);
			}}
		>
			{selected ? "Selected" : "Select"}
		</Button>
	);
}
