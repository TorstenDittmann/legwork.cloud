import type { NextConfig } from "next";

const config: NextConfig = {
	experimental: {
		dynamicOnHover: true,
	},
	serverExternalPackages: ["bun:sqlite"],
	transpilePackages: [
		"@oncall-ai/auth",
		"@oncall-ai/contracts",
		"@oncall-ai/db",
		"@oncall-ai/github",
		"@oncall-ai/observability",
		"@oncall-ai/security",
	],
};
export default config;
