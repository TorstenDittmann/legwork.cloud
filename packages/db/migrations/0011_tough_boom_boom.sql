CREATE TABLE `diagnosis_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`verdict` text NOT NULL,
	`note` text,
	`submitted_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `diagnosis_feedback_run_id_unique` ON `diagnosis_feedback` (`run_id`);--> statement-breakpoint
CREATE INDEX `diagnosis_feedback_org_date_idx` ON `diagnosis_feedback` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `diagnosis_feedback_expiry_idx` ON `diagnosis_feedback` (`expires_at`);--> statement-breakpoint
ALTER TABLE `incidents` ADD `resolved_at` integer;--> statement-breakpoint
ALTER TABLE `incidents` ADD `resolved_by` text;