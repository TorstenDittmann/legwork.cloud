import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variants = cva(
	"inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
	{
		variants: {
			variant: {
				default: "bg-cyan-400 text-slate-950 hover:bg-cyan-300",
				outline: "border border-slate-700 bg-transparent hover:bg-slate-800",
				ghost: "hover:bg-slate-800",
				destructive: "bg-red-500 text-white hover:bg-red-400",
			},
			size: { default: "h-10 px-4", sm: "h-8 px-3", lg: "h-12 px-6" },
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);
export function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> & VariantProps<typeof variants> & { asChild?: boolean }) {
	const Component = asChild ? Slot : "button";
	return <Component className={cn(variants({ variant, size }), className)} {...props} />;
}
