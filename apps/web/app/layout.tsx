import type { Metadata } from "next";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import "./globals.css";

export const metadata: Metadata = {
	title: "OnCall AI",
	description: "Evidence-backed incident diagnosis from exact source snapshots.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>
				<AuthKitProvider>{children}</AuthKitProvider>
			</body>
		</html>
	);
}
