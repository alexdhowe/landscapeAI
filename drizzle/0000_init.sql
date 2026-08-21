CREATE TABLE "assemblies" (
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	CONSTRAINT "assemblies_org_id_key_pk" PRIMARY KEY("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "assembly_components" (
	"org_id" uuid NOT NULL,
	"assembly_key" text NOT NULL,
	"position" integer NOT NULL,
	"cost_item_sku" text NOT NULL,
	"qty_per_unit" double precision,
	"production_rate" double precision,
	CONSTRAINT "assembly_components_org_id_assembly_key_position_pk" PRIMARY KEY("org_id","assembly_key","position")
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"org_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"unit" text NOT NULL,
	"unit_cost" double precision NOT NULL,
	"burden_pct" double precision,
	"waste_factor_pct" double precision,
	"plant_meta" jsonb,
	CONSTRAINT "cost_items_org_id_sku_pk" PRIMARY KEY("org_id","sku")
);
--> statement-breakpoint
CREATE TABLE "disclosure_policies" (
	"org_id" uuid NOT NULL,
	"role" text NOT NULL,
	"mode" text NOT NULL,
	"band_width_pct" double precision NOT NULL,
	"show_unit_rates" boolean DEFAULT false NOT NULL,
	"round_to" integer NOT NULL,
	"tier_multipliers" jsonb,
	CONSTRAINT "disclosure_policies_org_id_role_pk" PRIMARY KEY("org_id","role")
);
--> statement-breakpoint
CREATE TABLE "estimate_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" serial NOT NULL,
	"kind" text NOT NULL,
	"basis" text NOT NULL,
	"job_type" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"line_items" jsonb NOT NULL,
	"internal_total" double precision NOT NULL,
	"customer_facing_payload" text NOT NULL,
	"disclosure_policy_used" jsonb NOT NULL,
	"reconciliation" jsonb,
	CONSTRAINT "estimate_snapshots_project_kind_key" UNIQUE("project_id","kind")
);
--> statement-breakpoint
CREATE TABLE "margin_configs" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"target_gm_pct" double precision NOT NULL,
	"min_gm_pct" double precision NOT NULL,
	"contingency_pct" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_deltas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" serial NOT NULL,
	"region_id" text NOT NULL,
	"region_label" text NOT NULL,
	"job_type" text NOT NULL,
	"market_context" text NOT NULL,
	"unit" text NOT NULL,
	"before_qty" jsonb NOT NULL,
	"after_qty" jsonb NOT NULL,
	"source" text NOT NULL,
	"corrected_by" text NOT NULL,
	"corrected_at" timestamp with time zone NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"media_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"url" text,
	"exif" jsonb
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid,
	"status" text DEFAULT 'playing' NOT NULL,
	"market_context" text DEFAULT 'residential' NOT NULL,
	"address_declined" boolean DEFAULT false NOT NULL,
	"segmentation_status" text DEFAULT 'pending' NOT NULL,
	"segmentation_error" text,
	"segmentation_source" text,
	"vertical_elements" jsonb,
	"cannot_see" jsonb,
	"customer_contact" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"quoted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"geocode_source" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"parcel_geom" jsonb,
	"imagery_source" text,
	"imagery_captured_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"project_id" uuid NOT NULL,
	"region_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"polygon" jsonb NOT NULL,
	"existing_material" text,
	"condition" text,
	"estimated_area_sf" double precision,
	"confidence" double precision NOT NULL,
	"aerial_region_id" uuid,
	"ring" jsonb,
	"area_sf" jsonb,
	"perimeter_lf" jsonb,
	CONSTRAINT "regions_project_id_region_id_pk" PRIMARY KEY("project_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "selections" (
	"project_id" uuid NOT NULL,
	"region_id" text NOT NULL,
	"surface_option_id" text,
	"addon_option_ids" jsonb NOT NULL,
	CONSTRAINT "selections_project_id_region_id_pk" PRIMARY KEY("project_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "typology_distributions" (
	"org_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"market_context" text NOT NULL,
	"distribution_key" text NOT NULL,
	"unit" text NOT NULL,
	"p25" double precision NOT NULL,
	"p50" double precision NOT NULL,
	"p75" double precision NOT NULL,
	CONSTRAINT "typology_distributions_org_id_job_type_market_context_distribution_key_pk" PRIMARY KEY("org_id","job_type","market_context","distribution_key")
);
--> statement-breakpoint
CREATE TABLE "typology_recipes" (
	"org_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"position" integer NOT NULL,
	"assembly_key" text NOT NULL,
	"distribution_key" text NOT NULL,
	CONSTRAINT "typology_recipes_org_id_job_type_position_pk" PRIMARY KEY("org_id","job_type","position")
);
--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_assembly_fk" FOREIGN KEY ("org_id","assembly_key") REFERENCES "public"."assemblies"("org_id","key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_components" ADD CONSTRAINT "assembly_components_cost_item_fk" FOREIGN KEY ("org_id","cost_item_sku") REFERENCES "public"."cost_items"("org_id","sku") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosure_policies" ADD CONSTRAINT "disclosure_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_snapshots" ADD CONSTRAINT "estimate_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "margin_configs" ADD CONSTRAINT "margin_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_deltas" ADD CONSTRAINT "measurement_deltas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_region_fk" FOREIGN KEY ("project_id","region_id") REFERENCES "public"."regions"("project_id","region_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typology_distributions" ADD CONSTRAINT "typology_distributions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typology_recipes" ADD CONSTRAINT "typology_recipes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typology_recipes" ADD CONSTRAINT "typology_recipes_assembly_fk" FOREIGN KEY ("org_id","assembly_key") REFERENCES "public"."assemblies"("org_id","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assembly_components_assembly_idx" ON "assembly_components" USING btree ("org_id","assembly_key");--> statement-breakpoint
CREATE INDEX "estimate_snapshots_project_idx" ON "estimate_snapshots" USING btree ("project_id","seq");--> statement-breakpoint
CREATE INDEX "measurement_deltas_corrected_at_idx" ON "measurement_deltas" USING btree ("corrected_at","seq");--> statement-breakpoint
CREATE INDEX "measurement_deltas_project_idx" ON "measurement_deltas" USING btree ("project_id","corrected_at","seq");--> statement-breakpoint
CREATE INDEX "measurement_deltas_job_type_idx" ON "measurement_deltas" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "photos_project_idx" ON "photos" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_org_created_idx" ON "projects" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_submitted_idx" ON "projects" USING btree ("submitted_at");