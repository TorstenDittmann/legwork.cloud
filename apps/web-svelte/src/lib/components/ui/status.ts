export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'live';

export const statusTone: Record<string, BadgeTone> = {
	queued: 'neutral',
	provisioning: 'warning',
	analyzing: 'live',
	completed: 'success',
	inconclusive: 'warning',
	failed: 'danger',
	cancelled: 'neutral',
	enabled: 'success',
	disabled: 'neutral',
	pending: 'warning',
	passed: 'success',
	skipped: 'neutral'
};
