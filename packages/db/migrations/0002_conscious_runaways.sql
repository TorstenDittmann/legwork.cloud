CREATE TABLE `langgraph_checkpoint_writes` (
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`checkpoint_namespace` text DEFAULT '' NOT NULL,
	`checkpoint_id` text NOT NULL,
	`task_id` text NOT NULL,
	`write_index` integer NOT NULL,
	`channel` text NOT NULL,
	`type` text NOT NULL,
	`value` blob NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `langgraph_checkpoint_writes_unique_idx` ON `langgraph_checkpoint_writes` (`thread_id`,`checkpoint_namespace`,`checkpoint_id`,`task_id`,`write_index`);--> statement-breakpoint
CREATE INDEX `langgraph_checkpoint_writes_org_run_idx` ON `langgraph_checkpoint_writes` (`organization_id`,`run_id`);--> statement-breakpoint
CREATE INDEX `langgraph_checkpoint_writes_expiry_idx` ON `langgraph_checkpoint_writes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `langgraph_checkpoints` (
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`checkpoint_namespace` text DEFAULT '' NOT NULL,
	`checkpoint_id` text NOT NULL,
	`parent_checkpoint_id` text,
	`type` text NOT NULL,
	`checkpoint` blob NOT NULL,
	`metadata` blob NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`thread_id`, `checkpoint_namespace`, `checkpoint_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `langgraph_checkpoints_org_run_idx` ON `langgraph_checkpoints` (`organization_id`,`run_id`);--> statement-breakpoint
CREATE INDEX `langgraph_checkpoints_expiry_idx` ON `langgraph_checkpoints` (`expires_at`);--> statement-breakpoint
CREATE INDEX `langgraph_checkpoints_thread_idx` ON `langgraph_checkpoints` (`thread_id`,`checkpoint_namespace`,`checkpoint_id`);