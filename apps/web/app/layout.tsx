import type { Metadata, Viewport } from "next";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import "./globals.css";

export const metadata: Metadata = {
	title: { default: "OnCall AI", template: "%s — OnCall AI" },
	description: "Evidence-backed incident diagnosis from exact source snapshots.",
};
export const viewport: Viewport = { themeColor: "#10100e", colorScheme: "dark" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className="bg-[var(--canvas)]">
			<body>
				<AuthKitProvider>{children}</AuthKitProvider>
			</body>
		</html>
	);
}
