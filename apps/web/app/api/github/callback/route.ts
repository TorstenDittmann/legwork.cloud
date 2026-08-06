import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireTenant } from "@oncall-ai/auth";
import { auditEvents, createDatabase, githubInstallations } from "@oncall-ai/db";
import { verifyInstallationState } from "@oncall-ai/github";
import { enqueueGitHubSync } from "@/lib/queue";
import { HttpProblem, problemResponse } from "@/lib/http";

export async function GET(request: Request) {
	try {
		const tenant = await requireTenant("admin");
		const url = new URL(request.url);
		const state = url.searchParams.get("state");
		const installationNumber = Number(url.searchParams.get("installation_id"));
		if (
			!state ||
			!Number.isSafeInteger(installationNumber) ||
			installationNumber <= 0 ||
			!process.env.GITHUB_INSTALLATION_STATE_SECRET
		)
			throw new HttpProblem(
				400,
				"Invalid GitHub Callback",
				"Missing or invalid installation callback parameters",
			);
		const verified = verifyInstallationState(state, process.env.GITHUB_INSTALLATION_STATE_SECRET);
		if (verified.organizationId !== tenant.organizationId)
			throw new HttpProblem(403, "Forbidden", "Installation state belongs to another organization");
		const db = createDatabase();
		const [existing] = await db
			.select()
			.from(githubInstallations)
			.where(eq(githubInstallations.installationId, installationNumber))
			.limit(1);
		if (existing && existing.organizationId !== tenant.organizationId)
			throw new HttpProblem(
				409,
				"Installation Already Connected",
				"This GitHub installation belongs to another organization",
			);
		const [installation] = existing
			? [existing]
			: await db
					.insert(githubInstallations)
					.values({
						organizationId: tenant.organizationId,
						installationId: installationNumber,
						accountLogin: "pending-sync",
						accountId: installationNumber,
					})
					.returning();
		if (!installation) throw new Error("Failed to persist GitHub installation");
		await db.insert(auditEvents).values({
			organizationId: tenant.organizationId,
			actorId: tenant.userId,
			action: "github.connected",
			targetType: "github_installation",
			targetId: installation.id,
			metadata: { installationId: installationNumber },
		});
		await enqueueGitHubSync(installation.id);
		return NextResponse.redirect(`${process.env.APP_URL ?? url.origin}/repositories?connected=1`);
	} catch (error) {
		return problemResponse(error);
	}
}
