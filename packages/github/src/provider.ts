import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import type { RepositoryDownload, SourceProvider } from "@oncall-ai/contracts";

const ARCHIVE_HOST = "codeload.github.com";

export function validateArchiveDownloadUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("GitHub archive redirect URL is invalid");
	}
	if (
		url.protocol !== "https:" ||
		url.hostname !== ARCHIVE_HOST ||
		url.username ||
		url.password ||
		url.port
	)
		throw new Error("GitHub archive redirect target is not allowed");
	return url.toString();
}

export interface GitHubAppConfig {
	appId: string;
	privateKey: string;
}
export interface RepositoryDescriptor {
	repositoryId: string;
	githubRepositoryId: number;
	installationId: number;
	owner: string;
	name: string;
	defaultBranch: string;
}

export async function listInstallationRepositories(
	config: GitHubAppConfig,
	installationId: number,
) {
	const auth = createAppAuth({
		appId: config.appId,
		privateKey: config.privateKey,
		installationId,
	});
	const result = await auth({
		type: "installation",
		installationId,
		permissions: { contents: "read", metadata: "read" },
	});
	const octokit = new Octokit({ auth: result.token });
	const response = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {
		per_page: 100,
	});
	return response.map((repository) => ({
		githubRepositoryId: repository.id,
		owner: repository.owner.login,
		name: repository.name,
		fullName: repository.full_name,
		defaultBranch: repository.default_branch,
		archived: repository.archived,
	}));
}

export class GitHubSourceProvider implements SourceProvider {
	readonly #repositories: Map<string, RepositoryDescriptor>;
	readonly #config: GitHubAppConfig;

	constructor(config: GitHubAppConfig, repositories: RepositoryDescriptor[]) {
		this.#config = config;
		this.#repositories = new Map(
			repositories.map((repository) => [repository.repositoryId, repository]),
		);
	}

	async #token(repository: RepositoryDescriptor): Promise<string> {
		const auth = createAppAuth({
			appId: this.#config.appId,
			privateKey: this.#config.privateKey,
			installationId: repository.installationId,
		});
		const result = await auth({
			type: "installation",
			installationId: repository.installationId,
			repositoryIds: [repository.githubRepositoryId],
			permissions: { contents: "read", metadata: "read" },
		});
		return result.token;
	}

	#get(repositoryId: string): RepositoryDescriptor {
		const repository = this.#repositories.get(repositoryId);
		if (!repository) throw new Error("Repository is not approved for this run");
		return repository;
	}

	async resolveRevision(repositoryId: string, requestedSha?: string): Promise<string> {
		const repository = this.#get(repositoryId);
		const token = await this.#token(repository);
		const octokit = new Octokit({ auth: token });
		const response = await octokit.rest.repos.getCommit({
			owner: repository.owner,
			repo: repository.name,
			ref: requestedSha ?? repository.defaultBranch,
		});
		const sha = response.data.sha;
		if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("GitHub did not return an exact commit SHA");
		if (requestedSha && sha.toLowerCase() !== requestedSha.toLowerCase())
			throw new Error("Requested commit could not be resolved exactly");
		return sha;
	}

	async createArchiveDownload(repositoryId: string, sha: string): Promise<RepositoryDownload> {
		const repository = this.#get(repositoryId);
		if (!/^[0-9a-f]{40}$/.test(sha))
			throw new Error("Archive revision must be an exact commit SHA");
		const token = await this.#token(repository);
		const response = await fetch(
			`https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/tarball/${sha}`,
			{
				headers: {
					accept: "application/vnd.github+json",
					authorization: `Bearer ${token}`,
					"x-github-api-version": "2022-11-28",
					"user-agent": "on-call-ai-worker",
				},
				redirect: "manual",
			},
		);
		if (![301, 302, 303, 307, 308].includes(response.status))
			throw new Error(`GitHub archive redirect failed (${response.status})`);
		const location = response.headers.get("location");
		if (!location) throw new Error("GitHub archive redirect did not include a location");
		return { repositoryId, sha, url: validateArchiveDownloadUrl(location) };
	}
}
