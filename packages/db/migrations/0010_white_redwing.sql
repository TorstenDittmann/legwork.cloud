ALTER TABLE `organizations` ADD `activated_at` integer;--> statement-breakpoint
UPDATE `organizations`
SET `activated_at` = (
	SELECT MIN(`diagnoses`.`created_at`)
	FROM `diagnoses`
	WHERE `diagnoses`.`organization_id` = `organizations`.`id`
)
WHERE EXISTS (
	SELECT 1
	FROM `diagnoses`
	WHERE `diagnoses`.`organization_id` = `organizations`.`id`
);
