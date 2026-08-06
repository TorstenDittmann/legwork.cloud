import { metrics } from "@oncall-ai/observability";
export async function GET() { return new Response(await metrics.metrics(), { headers: { "content-type": metrics.contentType, "cache-control": "no-store" } }); }
