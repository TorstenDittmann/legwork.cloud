import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type { ToolResult } from "@legwork/contracts";
import type { GitHubAppConfig, RepositoryDescriptor } from "./provider";

const MAX_ITEMS = 20;

export class GitHubActivityProvider {
	readonly #config: GitHubAppConfig;
	readonly #repositories: Map<string, RepositoryDescriptor>;

	constructor(config: GitHubAppConfig, repositories: RepositoryDescriptor[]) {
		this.#config = config;
		this.#repositories = new Map(
			repositories.map((repository) => [repository.repositoryId, repository]),
		);
	}

	async recentActivity(
		repositoryId: string,
		lookbackHours: number,
		signal?: AbortSignal,
	): Promise<ToolResult> {
		const started = performance.now();
		const repository = this.#repositories.get(repositoryId);
		if (!repository)
			return {
				status: "unavailable",
				output: "Repository is not approved for this investigation",
				truncated: false,
				durationMs: 0,
				limitation: "GITHUB_REPOSITORY_NOT_APPROVED",
			};
		try {
			const auth = createAppAuth({
				appId: this.#config.appId,
				privateKey: this.#config.privateKey,
				installationId: repository.installationId,
			});
			const installation = await auth({
				type: "installation",
				installationId: repository.installationId,
				repositoryIds: [repository.githubRepositoryId],
				permissions: {
					actions: "read",
					contents: "read",
					deployments: "read",
					metadata: "read",
				},
			});
			const octokit = new Octokit({ auth: installation.token });
			const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1_000);
			const [runsResponse, deploymentsResponse] = await Promise.all([
				octokit.rest.actions.listWorkflowRunsForRepo({
					owner: repository.owner,
					repo: repository.name,
					created: `>=${since.toISOString()}`,
					per_page: MAX_ITEMS,
					...(signal ? { request: { signal } } : {}),
				}),
				octokit.rest.repos.listDeployments({
					owner: repository.owner,
					repo: repository.name,
					per_page: MAX_ITEMS,
					...(signal ? { request: { signal } } : {}),
				}),
			]);
			const deployments = deploymentsResponse.data.filter(
				(deployment) => new Date(deployment.created_at).getTime() >= since.getTime(),
			);
			const deploymentStatuses = await Promise.all(
				deployments.map(async (deployment) => {
					const response = await octokit.rest.repos.listDeploymentStatuses({
						owner: repository.owner,
						repo: repository.name,
						deployment_id: deployment.id,
						per_page: 1,
						...(signal ? { request: { signal } } : {}),
					});
					return response.data[0]?.state ?? "unknown";
				}),
			);
			const output = JSON.stringify(
				{
					repository: `${repository.owner}/${repository.name}`,
					since: since.toISOString(),
					workflowRuns: runsResponse.data.workflow_runs.slice(0, MAX_ITEMS).map((run) => ({
						name: run.name,
						event: run.event,
						status: run.status,
						conclusion: run.conclusion,
						headSha: run.head_sha,
						headBranch: run.head_branch,
						createdAt: run.created_at,
						updatedAt: run.updated_at,
						url: run.html_url,
					})),
					deployments: deployments.map((deployment, index) => ({
						environment: deployment.environment,
						state: deploymentStatuses[index],
						sha: deployment.sha,
						ref: deployment.ref,
						task: deployment.task,
						createdAt: deployment.created_at,
						updatedAt: deployment.updated_at,
					})),
				},
				null,
				2,
			);
			return {
				status: "ok",
				output,
				truncated: false,
				durationMs: Math.round(performance.now() - started),
			};
		} catch (error) {
			return {
				status: "unavailable",
				output: "GitHub activity could not be read",
				truncated: false,
				durationMs: Math.round(performance.now() - started),
				limitation:
					(error && typeof error === "object" && "status" in error && error.status === 403) ||
					(error instanceof Error && error.message.toLowerCase().includes("permission"))
						? "GITHUB_ACTIONS_DEPLOYMENTS_PERMISSION_REQUIRED"
						: "GITHUB_ACTIVITY_UNAVAILABLE",
			};
		}
	}
}
