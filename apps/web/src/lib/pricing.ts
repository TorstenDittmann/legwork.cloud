export type BillingInterval = 'month' | 'year';
export type PlanSlug = 'developer' | 'team' | 'scale';
export type PaidPlanSlug = Exclude<PlanSlug, 'developer'>;

export const FREE_ENTITLEMENTS = {
	monthlyAnalysisQuota: 50,
	monthlyTokenQuota: 5_000_000,
	maxConcurrentRuns: 1
} as const;

export const PAID_ENTITLEMENTS = {
	team: {
		monthlyAnalysisQuota: 1_500,
		monthlyTokenQuota: 150_000_000,
		maxConcurrentRuns: 2
	},
	scale: {
		monthlyAnalysisQuota: 5_000,
		monthlyTokenQuota: 500_000_000,
		maxConcurrentRuns: 5
	}
} as const;

export function formatQuota(value: number): string {
	return new Intl.NumberFormat('en-US').format(value);
}

export function formatTokenQuota(value: number): string {
	return new Intl.NumberFormat('en-US', {
		notation: 'compact',
		maximumFractionDigits: 1
	}).format(value);
}

export const pricingPlans = [
	{
		slug: 'developer',
		name: 'Developer',
		description: 'For proving Legwork on a service before the next page.',
		monthlyPrice: 0,
		annualPrice: 0,
		annualTotal: 0,
		entitlements: FREE_ENTITLEMENTS,
		features: [
			`${formatQuota(FREE_ENTITLEMENTS.monthlyAnalysisQuota)} investigations each month`,
			`${formatTokenQuota(FREE_ENTITLEMENTS.monthlyTokenQuota)} model tokens`,
			'1 investigation at a time',
			'GitHub, Grafana, and Sentry',
			'Slack, Discord, email, and webhooks'
		]
	},
	{
		slug: 'team',
		name: 'Team',
		description: 'For the team that owns the pager and needs an answer now.',
		monthlyPrice: 99,
		annualPrice: 83,
		annualTotal: 990,
		featured: true,
		entitlements: PAID_ENTITLEMENTS.team,
		features: [
			`${formatQuota(PAID_ENTITLEMENTS.team.monthlyAnalysisQuota)} investigations each month`,
			`${formatTokenQuota(PAID_ENTITLEMENTS.team.monthlyTokenQuota)} model tokens`,
			'2 investigations at a time',
			'Every alert and delivery integration',
			'Unlimited teammates'
		]
	},
	{
		slug: 'scale',
		name: 'Scale',
		description: 'For several services and an on-call rotation that stays busy.',
		monthlyPrice: 299,
		annualPrice: 249,
		annualTotal: 2_990,
		entitlements: PAID_ENTITLEMENTS.scale,
		features: [
			`${formatQuota(PAID_ENTITLEMENTS.scale.monthlyAnalysisQuota)} investigations each month`,
			`${formatTokenQuota(PAID_ENTITLEMENTS.scale.monthlyTokenQuota)} model tokens`,
			'5 investigations at a time',
			'Every alert and delivery integration',
			'Priority support'
		]
	}
] as const;

export function isBillingInterval(value: string): value is BillingInterval {
	return value === 'month' || value === 'year';
}

export function isPaidPlan(value: string): value is PaidPlanSlug {
	return value === 'team' || value === 'scale';
}

export function planName(slug: PlanSlug): string {
	return pricingPlans.find((plan) => plan.slug === slug)?.name ?? 'Developer';
}
