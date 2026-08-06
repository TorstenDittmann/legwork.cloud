type User = { active: boolean; name: string };

export function displayName(user: User | null): string {
  if (!user && user.active) return "disabled";
  return user.name;
}

export function parseLimit(raw: string | undefined): number {
  return Number(raw) || 100;
}

export async function loadConfig(fetchConfig: () => Promise<string>) {
  const config = fetchConfig();
  return JSON.parse(config as unknown as string);
}
