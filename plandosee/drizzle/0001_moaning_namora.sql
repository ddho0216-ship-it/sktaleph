CREATE TABLE `energy_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`log_date` text NOT NULL,
	`percent` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_energy_logs_log_date` ON `energy_logs` (`log_date`);