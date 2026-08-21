ALTER TABLE "assemblies" DROP CONSTRAINT "assemblies_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "assembly_components" DROP CONSTRAINT "assembly_components_revision_id_price_book_revisions_id_fk";
--> statement-breakpoint
ALTER TABLE "assembly_components" DROP CONSTRAINT "assembly_components_assembly_fk";
--> statement-breakpoint
ALTER TABLE "assembly_components" DROP CONSTRAINT "assembly_components_cost_item_fk";
--> statement-breakpoint
ALTER TABLE "cost_items" DROP CONSTRAINT "cost_items_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "disclosure_policies" DROP CONSTRAINT "disclosure_policies_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "margin_configs" DROP CONSTRAINT "margin_configs_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "typology_distributions" DROP CONSTRAINT "typology_distributions_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "typology_recipes" DROP CONSTRAINT "typology_recipes_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "typology_recipes" DROP CONSTRAINT "typology_recipes_assembly_fk";
--> statement-breakpoint
DROP INDEX "assembly_components_assembly_idx";--> statement-breakpoint
ALTER TABLE "assemblies" DROP CONSTRAINT "assemblies_org_id_key_pk";--> statement-breakpoint
ALTER TABLE "assembly_components" DROP CONSTRAINT "assembly_components_org_id_assembly_key_position_pk";--> statement-breakpoint
ALTER TABLE "cost_items" DROP CONSTRAINT "cost_items_org_id_sku_pk";--> statement-breakpoint
ALTER TABLE "disclosure_policies" DROP CONSTRAINT "disclosure_policies_org_id_role_pk";--> statement-breakpoint
ALTER TABLE "typology_distributions" DROP CONSTRAINT "typology_distributions_org_id_job_type_market_context_distribution_key_pk";--> statement-breakpoint
ALTER TABLE "typology_recipes" DROP CONSTRAINT "typology_recipes_org_id_job_type_position_pk";--> statement-breakpoint
ALTER TABLE "assemblies" ALTER COLUMN "revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assembly_components" ALTER COLUMN "revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_items" ALTER COLUMN "revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disclosure_policies" ALTER COLUMN "revision_id" SET NOT NULL;--> statement-breakpoint
-- margin_configs was keyed on org_id; that key has to go before the new
-- one can be added, and drizzle-kit does not emit the drop.
ALTER TABLE "margin_configs" DROP CONSTRAINT "margin_configs_pkey";--> statement-breakpoint
ALTER TABLE "margin_configs" ALTER COLUMN "revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "margin_configs" ADD CONSTRAINT "margin_configs_pkey" PRIMARY KEY ("revision_id");--> statement-breakpoint
ALTER TABLE "typology_distributions" ALTER COLUMN "revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "typology_recipes" ALTER COLUMN "revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_revision_id_key_pk" PRIMARY KEY("revision_id","key");--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_revision_id_assembly_key_position_pk" PRIMARY KEY("revision_id","assembly_key","position");--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_revision_id_sku_pk" PRIMARY KEY("revision_id","sku");--> statement-breakpoint
ALTER TABLE "disclosure_policies" ADD CONSTRAINT "disclosure_policies_revision_id_role_pk" PRIMARY KEY("revision_id","role");--> statement-breakpoint
ALTER TABLE "typology_distributions" ADD CONSTRAINT "typology_distributions_revision_id_job_type_market_context_distribution_key_pk" PRIMARY KEY("revision_id","job_type","market_context","distribution_key");--> statement-breakpoint
ALTER TABLE "typology_recipes" ADD CONSTRAINT "typology_recipes_revision_id_job_type_position_pk" PRIMARY KEY("revision_id","job_type","position");--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_assembly_fk" FOREIGN KEY ("revision_id","assembly_key") REFERENCES "public"."assemblies"("revision_id","key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_cost_item_fk" FOREIGN KEY ("revision_id","cost_item_sku") REFERENCES "public"."cost_items"("revision_id","sku") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typology_recipes" ADD CONSTRAINT "typology_recipes_assembly_fk" FOREIGN KEY ("revision_id","assembly_key") REFERENCES "public"."assemblies"("revision_id","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assembly_components_assembly_idx" ON "assembly_components" USING btree ("revision_id","assembly_key");--> statement-breakpoint
ALTER TABLE "assemblies" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "assembly_components" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "cost_items" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "disclosure_policies" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "margin_configs" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "typology_distributions" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "typology_recipes" DROP COLUMN "org_id";