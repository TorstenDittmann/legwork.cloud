import type { Diagnosis } from "@legwork/contracts";

export type InconclusiveReason =
	| "analysis_incomplete"
	| "evidence_unverified"
	| "model_output_invalid";

const copy: Record<InconclusiveReason, { summary: string; limitation: string }> = {
	analysis_incomplete: {
		summary: "The investigation ended before Legwork could produce a verifiable diagnosis.",
		limitation: "The available investigation did not contain enough verified evidence.",
	},
	evidence_unverified: {
		summary:
			"Legwork found a possible explanation, but could not verify its evidence against the inspected sources.",
		limitation: "The generated evidence references did not match the inspected sources.",
	},
	model_output_invalid: {
		summary:
			"Legwork could not validate the generated evidence references after one correction attempt.",
		limitation: "The generated evidence references were malformed or incomplete.",
	},
};

export function createInconclusiveDiagnosis(reason: InconclusiveReason): Diagnosis {
	const message = copy[reason];
	return {
		schemaVersion: "1",
		status: "inconclusive",
		title: "More evidence needed",
		summary: message.summary,
		rootCause: null,
		evidence: [],
		suggestedFix: null,
		checksRun: [],
		limitations: [message.limitation],
	};
}
