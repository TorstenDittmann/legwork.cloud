// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			auth: import('@workos/authkit-sveltekit').AuthKitAuth;
		}
		interface PageData {
			/** Page title rendered by the root layout as "<title> — Legwork". */
			title?: string;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
