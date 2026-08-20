import { describe, expect, it } from "vitest";
import {
	createIncidentAnalysisGraph,
	type IncidentAnalysisGraphDependencies,
} from "./analysis-graph";

const dependencies: IncidentAnalysisGraphDependencies = {
	db: {} as never,
	githubAppId: "1",
	githubPrivateKey: "key",
	openRouterApiKey: "key",
	model: "test/model",
	commandExecutionEnabled: false,
	capabilityProbePassed: false,
	encryptionKey: "0".repeat(64),
	expiresAt: new Date(0),
	recordActivity: async () => {},
};

describe("incident analysis graph wiring", () => {
	it("validates the model's claimed evidence before hydration can overwrite it", async () => {
		const graph = createIncidentAnalysisGraph(dependencies).compile();
		const drawable = await graph.getGraphAsync();
		const edges = drawable.edges.map((edge) => `${edge.source}->${edge.target}`);
		// Validation must see the model's claimed excerpts. Hydrating first
		// replaces every excerpt with the real snapshot text, which makes the
		// excerpt comparison pass by construction and lets fabricated citations
		// through.
		expect(edges).toContain("synthesize_diagnosis->validate_diagnosis");
		expect(edges).not.toContain("synthesize_diagnosis->hydrate_evidence");
		// Hydration canonicalizes excerpts for display only after they validated.
		expect(edges).toContain("hydrate_evidence->persist_result");
		expect(edges).not.toContain("hydrate_evidence->validate_diagnosis");
		// A repaired diagnosis re-enters validation, not hydration.
		expect(edges).toContain("repair_diagnosis->validate_diagnosis");
	});
});
