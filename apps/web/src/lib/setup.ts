export type SetupStepId = 'github' | 'repository' | 'service' | 'investigation';
export type SetupStepState = 'complete' | 'current' | 'in-progress' | 'upcoming';

export interface SetupProgressInput {
	installationCount: number;
	repositoryCount: number;
	selectedRepositoryCount: number;
	serviceCount: number;
	firstServiceId: string | null;
	incidentCount: number;
	latestIncidentId: string | null;
	diagnosisCount: number;
	activationRecorded: boolean;
}

export interface SetupStep {
	id: SetupStepId;
	label: string;
	description: string;
	cta: string;
	href: string;
	complete: boolean;
	state: SetupStepState;
}

export interface SetupProgress extends SetupProgressInput {
	steps: SetupStep[];
	completedSteps: number;
	totalSteps: number;
	activated: boolean;
	nextStep: SetupStep | null;
}

export function deriveSetupProgress(input: SetupProgressInput): SetupProgress {
	const githubConnected = input.installationCount > 0;
	const repositoryIncluded = input.selectedRepositoryCount > 0;
	const serviceCreated = input.serviceCount > 0;
	const investigationComplete = input.diagnosisCount > 0 || input.activationRecorded;
	const investigationStarted = input.incidentCount > 0 && !investigationComplete;

	const definitions: Array<Omit<SetupStep, 'state'>> = [
		{
			id: 'github',
			label: 'Connect GitHub',
			description: 'Install the read-only GitHub App for the code you want Legwork to inspect.',
			cta: githubConnected ? 'Manage GitHub' : 'Connect GitHub',
			href: '/api/github/install',
			complete: githubConnected
		},
		{
			id: 'repository',
			label: 'Include a repository',
			description:
				githubConnected && input.repositoryCount === 0
					? 'Your GitHub repositories are syncing. This usually takes a few seconds.'
					: 'Choose the repository Legwork may use as investigation evidence.',
			cta: repositoryIncluded ? 'Review repositories' : 'Choose repository',
			href: '/repositories?setup=1',
			complete: repositoryIncluded
		},
		{
			id: 'service',
			label: 'Create a service',
			description: 'Map incoming incident signals to the repository that explains them.',
			cta: serviceCreated ? 'Review services' : 'Create service',
			href: '/services/new?setup=1',
			complete: serviceCreated
		},
		{
			id: 'investigation',
			label: 'Run your first investigation',
			description: investigationComplete
				? 'Your workspace has returned its first evidence-backed investigation report.'
				: investigationStarted
					? 'Your first investigation is underway. Open it to follow the evidence as it arrives.'
					: 'Submit one real failure signal and see an evidence-backed diagnosis.',
			cta: investigationComplete
				? 'Review investigation'
				: investigationStarted
					? 'View investigation'
					: 'Start investigation',
			href: input.latestIncidentId
				? `/incidents/${input.latestIncidentId}`
				: investigationComplete
					? '/incidents'
					: `/incidents/new?setup=1${input.firstServiceId ? `&service=${input.firstServiceId}` : ''}`,
			complete: investigationComplete
		}
	];

	const firstIncomplete = definitions.findIndex((step) => !step.complete);
	const steps = definitions.map<SetupStep>((step, index) => ({
		...step,
		state: step.complete
			? 'complete'
			: step.id === 'investigation' && investigationStarted
				? 'in-progress'
				: index === firstIncomplete
					? 'current'
					: 'upcoming'
	}));
	const completedSteps = steps.filter((step) => step.complete).length;

	return {
		...input,
		steps,
		completedSteps,
		totalSteps: steps.length,
		activated: investigationComplete,
		nextStep: steps.find((step) => !step.complete) ?? null
	};
}
