import { describe, expect, it } from 'vitest';
import { deriveSetupProgress, type SetupProgressInput } from './setup';

const empty: SetupProgressInput = {
	installationCount: 0,
	repositoryCount: 0,
	selectedRepositoryCount: 0,
	serviceCount: 0,
	firstServiceId: null,
	incidentCount: 0,
	latestIncidentId: null,
	diagnosisCount: 0,
	activationRecorded: false
};

describe('deriveSetupProgress', () => {
	it('starts with GitHub and keeps later tasks upcoming', () => {
		const progress = deriveSetupProgress(empty);

		expect(progress.steps.map((step) => step.state)).toEqual([
			'current',
			'upcoming',
			'upcoming',
			'upcoming'
		]);
		expect(progress.nextStep?.id).toBe('github');
		expect(progress.activated).toBe(false);
	});

	it('guides a connected workspace to repository selection', () => {
		const progress = deriveSetupProgress({
			...empty,
			installationCount: 1,
			repositoryCount: 7
		});

		expect(progress.completedSteps).toBe(1);
		expect(progress.nextStep?.id).toBe('repository');
		expect(progress.steps[1]?.state).toBe('current');
	});

	it('links the first investigation to the created service', () => {
		const progress = deriveSetupProgress({
			...empty,
			installationCount: 1,
			repositoryCount: 7,
			selectedRepositoryCount: 1,
			serviceCount: 1,
			firstServiceId: 'service-1'
		});

		expect(progress.nextStep).toMatchObject({
			id: 'investigation',
			href: '/incidents/new?setup=1&service=service-1'
		});
	});

	it('keeps an active investigation visible until a diagnosis exists', () => {
		const progress = deriveSetupProgress({
			...empty,
			installationCount: 1,
			repositoryCount: 7,
			selectedRepositoryCount: 1,
			serviceCount: 1,
			firstServiceId: 'service-1',
			incidentCount: 1,
			latestIncidentId: 'incident-1'
		});

		expect(progress.steps[3]).toMatchObject({
			state: 'in-progress',
			href: '/incidents/incident-1',
			cta: 'View investigation'
		});
	});

	it('marks activation complete only after the first diagnosis', () => {
		const progress = deriveSetupProgress({
			...empty,
			installationCount: 1,
			repositoryCount: 7,
			selectedRepositoryCount: 1,
			serviceCount: 1,
			firstServiceId: 'service-1',
			incidentCount: 1,
			latestIncidentId: 'incident-1',
			diagnosisCount: 1
		});

		expect(progress.activated).toBe(true);
		expect(progress.completedSteps).toBe(progress.totalSteps);
		expect(progress.nextStep).toBeNull();
	});

	it('keeps activation complete after retained incident data is removed', () => {
		const progress = deriveSetupProgress({
			...empty,
			installationCount: 1,
			repositoryCount: 7,
			selectedRepositoryCount: 1,
			serviceCount: 1,
			firstServiceId: 'service-1',
			activationRecorded: true
		});

		expect(progress.activated).toBe(true);
		expect(progress.steps[3]?.state).toBe('complete');
	});
});
