import type * as React from "react";
import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.ComponentProps<"span">) { return <span className={cn("inline-flex rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-300", className)} {...props} />; }
