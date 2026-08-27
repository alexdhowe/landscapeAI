CREATE TABLE "added_plants" (
	"project_id" uuid NOT NULL,
	"added_plant_id" text NOT NULL,
	"region_id" text NOT NULL,
	"option_id" text NOT NULL,
	"cx" double precision NOT NULL,
	"cy" double precision NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "added_plants_project_id_added_plant_id_pk" PRIMARY KEY("project_id","added_plant_id")
);
--> statement-breakpoint
ALTER TABLE "added_plants" ADD CONSTRAINT "added_plants_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
