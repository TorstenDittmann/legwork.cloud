"use client";

import { Button } from "@/components/ui/button";

export function ConfirmSubmit({
	message,
	children,
}: {
	message: string;
	children: React.ReactNode;
}) {
	return (
		<Button
			type="submit"
			size="sm"
			variant="destructive"
			onClick={(event) => {
				if (!window.confirm(message)) event.preventDefault();
			}}
		>
			{children}
		</Button>
	);
}
