UPDATE `organizations`
SET
	`monthly_analysis_quota` = 1500,
	`monthly_token_quota` = 150000000,
	`max_concurrent_runs` = 2
WHERE `id` IN (
	SELECT `organization_id`
	FROM `billing_subscriptions`
	WHERE `status` = 'active' AND `plan` = 'team'
);--> statement-breakpoint
UPDATE `organizations`
SET
	`monthly_analysis_quota` = 5000,
	`monthly_token_quota` = 500000000,
	`max_concurrent_runs` = 5
WHERE `id` IN (
	SELECT `organization_id`
	FROM `billing_subscriptions`
	WHERE `status` = 'active' AND `plan` = 'scale'
);
