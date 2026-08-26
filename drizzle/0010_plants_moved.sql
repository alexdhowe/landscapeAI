-- Where the customer moved a plant to.
--
-- Its own table rather than two more columns on plant_selections, because a
-- position is orthogonal to the decision that table holds: a plant can be moved
-- AND swapped, since where it goes and what it is are different questions.
-- Squeezing it in would have meant relaxing the check constraint that makes
-- that row trustworthy.
--
-- Normalized coordinates, like every other geometry the photo carries, so they
-- survive the image being re-encoded or re-scaled. Absent for every plant
-- standing where the photograph found it, which is nearly all of them -- "where
-- it is" is already recorded, in the segmentation, and a second copy of it is a
-- second thing to keep in sync.
CREATE TABLE "plant_positions" (
	"project_id" uuid NOT NULL,
	"planting_id" text NOT NULL,
	"cx" double precision NOT NULL,
	"cy" double precision NOT NULL,
	CONSTRAINT "plant_positions_project_id_planting_id_pk" PRIMARY KEY("project_id","planting_id")
);
--> statement-breakpoint
ALTER TABLE "plant_positions" ADD CONSTRAINT "plant_positions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
