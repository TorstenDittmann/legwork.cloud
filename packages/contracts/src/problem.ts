import { z } from "zod";

export const problemDetailsSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
}).strict();

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export function problem(status: number, title: string, detail?: string, errors?: Record<string, string[]>): ProblemDetails {
  return {
    type: `https://oncall.ai/problems/${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`,
    title,
    status,
    ...(detail ? { detail } : {}),
    ...(errors ? { errors } : {}),
  };
}
