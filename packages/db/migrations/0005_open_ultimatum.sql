CREATE TABLE `notification_channel_services` (
	`organization_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`service_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `service_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_channel_services_service_idx` ON `notification_channel_services` (`organization_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`mode` text NOT NULL,
	`name` text NOT NULL,
	`destination_ciphertext` text NOT NULL,
	`destination_hint` text NOT NULL,
	`events` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_verified_at` integer,
	`last_verification_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_channels_org_idx` ON `notification_channels` (`organization_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`run_id` text,
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
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_pending_idx` ON `notification_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_expiry_idx` ON `notification_deliveries` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_run_idx` ON `notification_deliveries` (`channel_id`,`run_id`) WHERE "notification_deliveries"."run_id" is not null;