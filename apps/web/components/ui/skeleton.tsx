import type * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			aria-hidden="true"
			className={cn("animate-pulse rounded-[3px] bg-surface-raised", className)}
			{...props}
		/>
	);
}

export function LoadingStatus({ label }: { label: string }) {
	return (
		<span className="sr-only" role="status" aria-live="polite">
			{label}
		</span>
	);
}
