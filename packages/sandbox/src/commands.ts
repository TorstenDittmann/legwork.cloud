export type CheckName = "test" | "build" | "lint" | "typecheck";

export interface DiscoveredCommand { executable: string; args: string[]; environment: Record<string, string> }

export function discoverCheckCommand(files: Set<string>, packageJson: unknown, check: CheckName): DiscoveredCommand | null {
  if (files.has("package.json")) {
    const scripts = packageJson && typeof packageJson === "object" && "scripts" in packageJson
      ? (packageJson as { scripts?: Record<string, unknown> }).scripts : undefined;
    if (typeof scripts?.[check] !== "string") return null;
    return { executable: "pnpm", args: ["--offline", "run", check], environment: { CI: "true", npm_config_offline: "true" } };
  }
  if (files.has("go.mod")) {
    if (check === "test") return { executable: "go", args: ["test", "./..."], environment: { GOPROXY: "off", GOSUMDB: "off" } };
    if (check === "build") return { executable: "go", args: ["build", "./..."], environment: { GOPROXY: "off", GOSUMDB: "off" } };
    if (check === "typecheck") return { executable: "go", args: ["vet", "./..."], environment: { GOPROXY: "off", GOSUMDB: "off" } };
    return null;
  }
  if (files.has("Cargo.toml")) {
    if (check === "test") return { executable: "cargo", args: ["test", "--offline", "--locked"], environment: { CARGO_NET_OFFLINE: "true" } };
    if (check === "build" || check === "typecheck") return { executable: "cargo", args: ["check", "--offline", "--locked"], environment: { CARGO_NET_OFFLINE: "true" } };
    return null;
  }
  if (files.has("pyproject.toml") || files.has("pytest.ini")) {
    if (check === "test") return { executable: "python3", args: ["-m", "pytest", "-q"], environment: { PIP_NO_INDEX: "1" } };
    if (check === "lint") return { executable: "python3", args: ["-m", "ruff", "check", "."], environment: { PIP_NO_INDEX: "1" } };
    if (check === "typecheck") return { executable: "python3", args: ["-m", "mypy", "."], environment: { PIP_NO_INDEX: "1" } };
  }
  return null;
}

export function shellQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'`; }
