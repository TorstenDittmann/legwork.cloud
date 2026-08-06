CREATE TABLE `agent_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`tool_name` text,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_steps_run_sequence_idx` ON `agent_steps` (`run_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`retry_of_run_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`resolved_revisions` text,
	`sandbox_id` text,
	`failure_code` text,
	`failure_message` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analysis_runs_org_status_idx` ON `analysis_runs` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `analysis_runs_expiry_idx` ON `analysis_runs` (`expires_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_events_org_date_idx` ON `audit_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `callback_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`event` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`response_status` integer,
	`error` text,
	`next_attempt_at` integer,
	`delivered_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `callback_deliveries_pending_idx` ON `callback_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`diagnosis` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diagnoses_run_id_unique` ON `diagnoses` (`run_id`);--> statement-breakpoint
CREATE TABLE `durable_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`singleton_key` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 1 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_expires_at` integer,
	`lease_owner` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `durable_jobs_singleton_idx` ON `durable_jobs` (`name`,`singleton_key`) WHERE "durable_jobs"."status" in ('queued', 'active');--> statement-breakpoint
CREATE INDEX `durable_jobs_claim_idx` ON `durable_jobs` (`name`,`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `github_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`installation_id` integer NOT NULL,
	`account_login` text NOT NULL,
	`account_id` integer NOT NULL,
	`suspended_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_installations_installation_id_unique` ON `github_installations` (`installation_id`);--> statement-breakpoint
CREATE INDEX `github_installations_org_idx` ON `github_installations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`external_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`title` text NOT NULL,
	`severity` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incidents_service_idempotency_idx` ON `incidents` (`service_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `incidents_org_date_idx` ON `incidents` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `incidents_expiry_idx` ON `incidents` (`expires_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`workos_organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`beta_allowlisted` integer DEFAULT false NOT NULL,
	`monthly_analysis_quota` integer DEFAULT 50 NOT NULL,
	`monthly_token_quota` integer DEFAULT 5000000 NOT NULL,
	`max_concurrent_runs` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_workos_organization_id_unique` ON `organizations` (`workos_organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`github_installation_id` text NOT NULL,
	`github_repository_id` integer NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`default_branch` text NOT NULL,
	`selected` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`removed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`github_installation_id`) REFERENCES `github_installations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_github_repository_id_unique` ON `repositories` (`github_repository_id`);--> statement-breakpoint
CREATE INDEX `repositories_org_idx` ON `repositories` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_installation_repo_idx` ON `repositories` (`github_installation_id`,`github_repository_id`);--> statement-breakpoint
CREATE TABLE `service_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_api_keys_key_hash_unique` ON `service_api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `service_api_keys_prefix_idx` ON `service_api_keys` (`prefix`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_service_key_idx` ON `service_api_keys` (`service_id`) WHERE "service_api_keys"."active" = 1;--> statement-breakpoint
CREATE TABLE `service_rate_limits` (
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`requests` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`service_id`, `window_started_at`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_rate_limits_expiry_idx` ON `service_rate_limits` (`window_started_at`);--> statement-breakpoint
CREATE TABLE `service_repositories` (
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`role` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`service_id`, `repository_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_primary_repository_idx` ON `service_repositories` (`service_id`) WHERE "service_repositories"."role" = 'primary';--> statement-breakpoint
CREATE UNIQUE INDEX `service_repository_position_idx` ON `service_repositories` (`service_id`,`role`,`position`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`callback_url` text,
	`callback_secret_ciphertext` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_org_slug_idx` ON `services` (`organization_id`,`slug`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_id` text,
	`kind` text NOT NULL,
	`analyses` integer DEFAULT 0 NOT NULL,
	`reserved_tokens` integer DEFAULT 0 NOT NULL,
	`actual_input_tokens` integer DEFAULT 0 NOT NULL,
	`actual_output_tokens` integer DEFAULT 0 NOT NULL,
	`period_start` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `usage_events_org_period_idx` ON `usage_events` (`organization_id`,`period_start`);