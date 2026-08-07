CREATE TABLE `alert_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`connection_id` text,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config` text NOT NULL,
	`webhook_secret_ciphertext` text NOT NULL,
	`last_received_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `provider_connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `alert_integrations_org_service_idx` ON `alert_integrations` (`organization_id`,`service_id`);--> statement-breakpoint
CREATE TABLE `external_incident_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_group_key` text NOT NULL,
	`episode_key` text NOT NULL,
	`state` text NOT NULL,
	`started_at` integer NOT NULL,
	`acknowledged_at` integer,
	`resolved_at` integer,
	`last_seen_at` integer NOT NULL,
	`notification_count` integer DEFAULT 1 NOT NULL,
	`provider_context` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_id`) REFERENCES `alert_integrations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_incident_links_episode_idx` ON `external_incident_links` (`integration_id`,`episode_key`);--> statement-breakpoint
CREATE INDEX `external_incident_links_group_idx` ON `external_incident_links` (`integration_id`,`external_group_key`,`state`);--> statement-breakpoint
CREATE INDEX `external_incident_links_expiry_idx` ON `external_incident_links` (`expires_at`);--> statement-breakpoint
CREATE TABLE `integration_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`provider_delivery_id` text,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`failure_code` text,
	`received_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_id`) REFERENCES `alert_integrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_deliveries_payload_idx` ON `integration_deliveries` (`integration_id`,`payload_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_deliveries_provider_id_idx` ON `integration_deliveries` (`integration_id`,`provider_delivery_id`) WHERE "integration_deliveries"."provider_delivery_id" is not null;--> statement-breakpoint
CREATE INDEX `integration_deliveries_expiry_idx` ON `integration_deliveries` (`expires_at`);--> statement-breakpoint
CREATE TABLE `provider_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`base_url` text NOT NULL,
	`config` text NOT NULL,
	`credentials_ciphertext` text NOT NULL,
	`capabilities` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_verified_at` integer,
	`last_verification_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provider_connections_org_provider_idx` ON `provider_connections` (`organization_id`,`provider`);--> statement-breakpoint
CREATE INDEX `provider_connections_org_enabled_idx` ON `provider_connections` (`organization_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `service_provider_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`query_policy` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `provider_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_provider_binding_connection_idx` ON `service_provider_bindings` (`service_id`,`connection_id`);--> statement-breakpoint
CREATE INDEX `service_provider_bindings_org_service_idx` ON `service_provider_bindings` (`organization_id`,`service_id`);