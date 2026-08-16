PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`workos_organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`beta_allowlisted` integer DEFAULT false NOT NULL,
	`monthly_analysis_quota` integer DEFAULT 25 NOT NULL,
	`monthly_token_quota` integer DEFAULT 2500000 NOT NULL,
	`max_concurrent_runs` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_organizations`("id", "workos_organization_id", "name", "slug", "beta_allowlisted", "monthly_analysis_quota", "monthly_token_quota", "max_concurrent_runs", "created_at", "updated_at") SELECT "id", "workos_organization_id", "name", "slug", "beta_allowlisted", "monthly_analysis_quota", "monthly_token_quota", "max_concurrent_runs", "created_at", "updated_at" FROM `organizations`;--> statement-breakpoint
DROP TABLE `organizations`;--> statement-breakpoint
ALTER TABLE `__new_organizations` RENAME TO `organizations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_workos_organization_id_unique` ON `organizations` (`workos_organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
UPDATE `organizations`
SET
	`monthly_analysis_quota` = 250,
	`monthly_token_quota` = 25000000,
	`max_concurrent_runs` = 2
WHERE `id` IN (
	SELECT `organization_id`
	FROM `billing_subscriptions`
	WHERE `status` = 'active' AND `plan` = 'team'
);--> statement-breakpoint
UPDATE `organizations`
SET
	`monthly_analysis_quota` = 1000,
	`monthly_token_quota` = 100000000,
	`max_concurrent_runs` = 5
WHERE `id` IN (
	SELECT `organization_id`
	FROM `billing_subscriptions`
	WHERE `status` = 'active' AND `plan` = 'scale'
);--> statement-breakpoint
UPDATE `organizations`
SET
	`monthly_analysis_quota` = MAX(`monthly_analysis_quota`, 25),
	`monthly_token_quota` = MAX(`monthly_token_quota`, 2500000)
WHERE NOT EXISTS (
	SELECT 1
	FROM `billing_subscriptions`
	WHERE
		`billing_subscriptions`.`organization_id` = `organizations`.`id`
		AND `billing_subscriptions`.`status` = 'active'
);
