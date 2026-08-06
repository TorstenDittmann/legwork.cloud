import { withAuth } from "@workos-inc/authkit-nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeOnboarding } from "./complete/actions";

export default async function OnboardingPage() {
  const session = await withAuth({ ensureSignedIn: true });
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6"><p className="font-mono text-xs uppercase tracking-widest text-cyan-400">WorkOS organization</p><h1 className="mt-3 text-3xl font-semibold text-white">Create your workspace</h1><p className="mt-4 text-sm leading-6 text-slate-400">Every repository, service, incident, and run is scoped to the active WorkOS organization.</p><form action={completeOnboarding} className="mt-8 space-y-4">{!session.organizationId && <label className="block text-sm">Organization name<Input name="name" required minLength={2} maxLength={255} className="mt-2" /></label>}<Button type="submit">{session.organizationId ? "Finish organization setup" : "Create organization"}</Button></form></main>;
}
