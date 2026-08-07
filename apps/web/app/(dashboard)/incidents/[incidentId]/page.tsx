import { IncidentLive } from "./incident-live";
export default async function IncidentPage({
	params,
}: {
	params: Promise<{ incidentId: string }>;
}) {
	const { incidentId } = await params;
	return <IncidentLive incidentId={incidentId} />;
}
