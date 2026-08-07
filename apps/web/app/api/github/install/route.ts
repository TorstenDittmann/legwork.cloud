import { NextResponse } from "next/server";
import { requireTenant } from "@oncall-ai/auth";
import { createInstallationState } from "@oncall-ai/github";
import { problemResponse } from "@/lib/http";

export async function GET() {
	try {
		const tenant = await requireTenant("admin");
		if (!process.env.GITHUB_INSTALLATION_STATE_SECRET || !process.env.GITHUB_APP_SLUG)
			throw new Error("GitHub App is not configured");
		const state = createInstallationState(
			tenant.organizationId,
			process.env.GITHUB_INSTALLATION_STATE_SECRET,
		);
		return NextResponse.redirect(
			`https://github.com/apps/${encodeURIComponent(process.env.GITHUB_APP_SLUG)}/installations/new?state=${encodeURIComponent(state)}`,
		);
	} catch (error) {
		return problemResponse(error);
	}
}
