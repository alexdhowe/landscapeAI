-- Plug-and-play plants: what the customer put in place of one the photo found.
--
-- Keyed by the plant rather than the region, because the unit of choice is one
-- plant. Swapping the boxwood by the door leaves the other four shrubs in the
-- same bed alone, which is the whole point of the feature.
--
-- The plants themselves are not rows. They arrive as part of one segmentation
-- result and are written and replaced whole, so they live in regions.plantings.
-- That is why the foreign key here is on the project alone: there is no plant
-- row to reference. Re-segmenting a project therefore leaves a selection behind
-- rather than cascading it away, and every reader resolves a stored selection
-- against the CURRENT segmentation before trusting it — a choice naming a plant
-- the new pass did not find is ignored, never priced.

CREATE TABLE "plant_selections" (
	"project_id" uuid NOT NULL,
	"planting_id" text NOT NULL,
	"option_id" text NOT NULL,
	CONSTRAINT "plant_selections_project_id_planting_id_pk" PRIMARY KEY("project_id","planting_id")
);
--> statement-breakpoint
ALTER TABLE "plant_selections" ADD CONSTRAINT "plant_selections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;