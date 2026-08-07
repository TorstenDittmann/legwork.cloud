import { handleAuth } from "@workos-inc/authkit-nextjs";

export const GET = handleAuth({
	returnPathname: "/onboarding",
	...(process.env.APP_URL ? { baseURL: process.env.APP_URL } : {}),
});
