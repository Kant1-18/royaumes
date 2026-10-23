CREATE SCHEMA "forge";
--> statement-breakpoint
CREATE TABLE "forge"."workshops" (
	"player_id" text PRIMARY KEY NOT NULL,
	"level" integer NOT NULL
);
