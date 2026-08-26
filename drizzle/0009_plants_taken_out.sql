-- The plants the customer took out.
--
-- A plant is either left alone, replaced with something else, or taken out.
-- That is one decision about one plant, so it lives in one row rather than in a
-- table of its own: a design that held both a replacement and a removal for the
-- same shrub would be a contradiction every reader downstream would have to
-- arbitrate, and the check constraint here means none of them has to.
--
-- Taking a plant out is a real instruction with a real cost -- the crew digs it
-- up and hauls it away -- so it prices through `shrub_removal`, which was
-- already in the book and already in the foundation-refresh recipe before
-- anything could select it. A design that shows eight shrubs gone and does not
-- bid their removal hands the contractor a quote they lose money on.
ALTER TABLE "plant_selections" ALTER COLUMN "option_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "plant_selections" ADD COLUMN "removed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plant_selections" ADD CONSTRAINT "plant_selection_is_one_decision" CHECK (("plant_selections"."option_id" is not null) <> "plant_selections"."removed");
