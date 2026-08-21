CREATE TABLE "price_book_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"label" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	CONSTRAINT "price_book_revisions_org_revision_key" UNIQUE("org_id","revision")
);
--> statement-breakpoint
ALTER TABLE "assemblies" ADD COLUMN "revision_id" uuid;--> statement-breakpoint
ALTER TABLE "assembly_components" ADD COLUMN "revision_id" uuid;--> statement-breakpoint
ALTER TABLE "cost_items" ADD COLUMN "revision_id" uuid;--> statement-breakpoint
ALTER TABLE "disclosure_policies" ADD COLUMN "revision_id" uuid;--> statement-breakpoint
ALTER TABLE "estimate_snapshots" ADD COLUMN "price_book_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "margin_configs" ADD COLUMN "revision_id" uuid;--> statement-breakpoint
ALTER TABLE "typology_distributions" ADD COLUMN "revision_id" uuid;--> statement-breakpoint
ALTER TABLE "typology_recipes" ADD COLUMN "revision_id" uuid;--> statement-breakpoint
ALTER TABLE "price_book_revisions" ADD CONSTRAINT "price_book_revisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_book_revisions_published_idx" ON "price_book_revisions" USING btree ("org_id","published_at");--> statement-breakpoint
CREATE INDEX "price_book_revisions_status_idx" ON "price_book_revisions" USING btree ("org_id","status");--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_revision_id_price_book_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."price_book_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_revision_id_price_book_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."price_book_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_revision_id_price_book_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."price_book_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosure_policies" ADD CONSTRAINT "disclosure_policies_revision_id_price_book_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."price_book_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_snapshots" ADD CONSTRAINT "estimate_snapshots_price_book_revision_id_price_book_revisions_id_fk" FOREIGN KEY ("price_book_revision_id") REFERENCES "public"."price_book_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "margin_configs" ADD CONSTRAINT "margin_configs_revision_id_price_book_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."price_book_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typology_distributions" ADD CONSTRAINT "typology_distributions_revision_id_price_book_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."price_book_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typology_recipes" ADD CONSTRAINT "typology_recipes_revision_id_price_book_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."price_book_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Every org's existing price book becomes its revision 1, already
-- published: it is what has been pricing real estimates.
INSERT INTO "price_book_revisions"
  ("org_id", "revision", "status", "label", "note", "created_by", "created_at", "published_by", "published_at")
SELECT
  o."id", 1, 'published', 'Initial price book',
  'The seeded book, adopted as revision 1 when revisions were introduced.',
  'system', o."created_at", 'system', o."created_at"
FROM "organizations" o;--> statement-breakpoint
UPDATE "cost_items" t SET "revision_id" = r."id"
  FROM "price_book_revisions" r WHERE r."org_id" = t."org_id" AND r."revision" = 1;--> statement-breakpoint
UPDATE "assemblies" t SET "revision_id" = r."id"
  FROM "price_book_revisions" r WHERE r."org_id" = t."org_id" AND r."revision" = 1;--> statement-breakpoint
UPDATE "assembly_components" t SET "revision_id" = r."id"
  FROM "price_book_revisions" r WHERE r."org_id" = t."org_id" AND r."revision" = 1;--> statement-breakpoint
UPDATE "margin_configs" t SET "revision_id" = r."id"
  FROM "price_book_revisions" r WHERE r."org_id" = t."org_id" AND r."revision" = 1;--> statement-breakpoint
UPDATE "disclosure_policies" t SET "revision_id" = r."id"
  FROM "price_book_revisions" r WHERE r."org_id" = t."org_id" AND r."revision" = 1;--> statement-breakpoint
UPDATE "typology_distributions" t SET "revision_id" = r."id"
  FROM "price_book_revisions" r WHERE r."org_id" = t."org_id" AND r."revision" = 1;--> statement-breakpoint
UPDATE "typology_recipes" t SET "revision_id" = r."id"
  FROM "price_book_revisions" r WHERE r."org_id" = t."org_id" AND r."revision" = 1;--> statement-breakpoint
-- Snapshots frozen before this point were priced from that same book.
UPDATE "estimate_snapshots" s SET "price_book_revision_id" = r."id"
  FROM "projects" p, "price_book_revisions" r
  WHERE s."project_id" = p."id" AND r."org_id" = p."org_id" AND r."revision" = 1;--> statement-breakpoint
-- At most one draft per org. Two drafts would be two answers to "what am I
-- editing", and publishing either would silently discard the other. Drizzle
-- cannot express a partial unique index, so it lives here.
CREATE UNIQUE INDEX "price_book_revisions_one_draft_per_org"
  ON "price_book_revisions" ("org_id") WHERE "status" = 'draft';
