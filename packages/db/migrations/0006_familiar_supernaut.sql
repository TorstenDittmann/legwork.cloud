CREATE TABLE `billing_subscriptions` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'dodo' NOT NULL,
	`plan` text NOT NULL,
	`billing_interval` text NOT NULL,
	`status` text NOT NULL,
	`customer_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`product_id` text NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`current_period_end` integer,
	`last_event_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_subscriptions_subscription_id_unique` ON `billing_subscriptions` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `billing_subscriptions_customer_idx` ON `billing_subscriptions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `billing_subscriptions_status_idx` ON `billing_subscriptions` (`status`);--> statement-breakpoint
CREATE TABLE `billing_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`event_timestamp` integer NOT NULL,
	`error` text,
	`processed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `billing_webhook_events_status_idx` ON `billing_webhook_events` (`status`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`workos_organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`beta_allowlisted` integer DEFAULT false NOT NULL,
	`monthly_analysis_quota` integer DEFAULT 5 NOT NULL,
	`monthly_token_quota` integer DEFAULT 500000 NOT NULL,
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
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);