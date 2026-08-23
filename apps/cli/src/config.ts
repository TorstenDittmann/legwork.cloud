import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError, UsageError } from "./errors";

export const DEFAULT_API_URL = "https://legwork.dev";

export interface LegworkConfig {
	apiUrl: string;
	service: string;
	apiKey: string;
}

type Environment = Record<string, string | undefined>;

export function getConfigPath(environment: Environment = process.env): string {
	if (environment.LEGWORK_CONFIG?.trim()) return environment.LEGWORK_CONFIG.trim();
	const configRoot = environment.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
	return join(configRoot, "legwork", "config.json");
}

export function normalizeApiUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new UsageError(`Invalid Legwork URL: ${value}`);
	}

	const localHost =
		url.hostname === "localhost" ||
		url.hostname === "127.0.0.1" ||
		url.hostname === "::1" ||
		url.hostname === "[::1]" ||
		url.hostname.endsWith(".localhost");
	if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost))
		throw new UsageError("Legwork URL must use HTTPS (HTTP is allowed for localhost only)");
	if (url.username || url.password)
		throw new UsageError("Legwork URL must not contain credentials");
	if (url.search || url.hash || (url.pathname !== "/" && url.pathname !== ""))
		throw new UsageError("Legwork URL must be an origin without a path, query, or fragment");
	return url.origin;
}

export function validateServiceSlug(value: string): string {
	const service = value.trim();
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service) || service.length > 128)
		throw new UsageError("Service must be its lowercase slug (for example, payments-api)");
	return service;
}

export function validateApiKey(value: string): string {
	const apiKey = value.trim();
	if (!/^ocai_live_[A-Za-z0-9_-]{43}$/.test(apiKey))
		throw new UsageError("Ingestion key must be a complete ocai_live_ key");
	return apiKey;
}

function parseStoredConfig(value: unknown, path: string): LegworkConfig {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new CliError(`Invalid config at ${path}; run legwork configure to replace it`);
	const config = value as Record<string, unknown>;
	if (
		typeof config.apiUrl !== "string" ||
		typeof config.service !== "string" ||
		typeof config.apiKey !== "string"
	)
		throw new CliError(`Invalid config at ${path}; run legwork configure to replace it`);
	try {
		return {
			apiUrl: normalizeApiUrl(config.apiUrl),
			service: validateServiceSlug(config.service),
			apiKey: validateApiKey(config.apiKey),
		};
	} catch {
		throw new CliError(`Invalid config at ${path}; run legwork configure to replace it`);
	}
}

export async function readStoredConfig(
	environment: Environment = process.env,
): Promise<LegworkConfig | undefined> {
	const path = getConfigPath(environment);
	try {
		return parseStoredConfig(JSON.parse(await readFile(path, "utf8")) as unknown, path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		if (error instanceof CliError) throw error;
		throw new CliError(`Could not read config at ${path}: ${errorMessage(error)}`);
	}
}

export interface ConnectionOverrides {
	apiUrl?: string;
	service?: string;
	apiKey?: string;
}

export async function resolveConfig(
	overrides: ConnectionOverrides,
	environment: Environment = process.env,
): Promise<LegworkConfig> {
	const stored = await readStoredConfig(environment);
	const apiUrl =
		overrides.apiUrl ??
		environment.LEGWORK_API_URL ??
		environment.LEGWORK_URL ??
		stored?.apiUrl ??
		DEFAULT_API_URL;
	const service = overrides.service ?? environment.LEGWORK_SERVICE ?? stored?.service;
	const apiKey = overrides.apiKey ?? environment.LEGWORK_API_KEY ?? stored?.apiKey;
	if (!service)
		throw new CliError("No service configured. Run legwork configure --service <service-slug>");
	if (!apiKey)
		throw new CliError("No ingestion key configured. Run legwork configure or set LEGWORK_API_KEY");
	return {
		apiUrl: normalizeApiUrl(apiUrl),
		service: validateServiceSlug(service),
		apiKey: validateApiKey(apiKey),
	};
}

export async function writeConfig(
	config: LegworkConfig,
	environment: Environment = process.env,
): Promise<string> {
	const path = getConfigPath(environment);
	const directory = dirname(path);
	const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
	await mkdir(directory, { recursive: true, mode: 0o700 });
	try {
		await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
			flag: "wx",
		});
		await rename(temporaryPath, path);
		await chmod(path, 0o600);
		return path;
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw new CliError(`Could not save config at ${path}: ${errorMessage(error)}`);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
