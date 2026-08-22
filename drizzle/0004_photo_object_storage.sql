-- Photo bytes move out of the photo record and behind lib/storage.
--
-- `photos.bytes` was interim storage (project-map section 3 names
-- S3-compatible object storage) and `photos.url` — section 5's field — was
-- null on every row. After this migration the bytes live in a key → bytes
-- object store and `url` holds the locator that finds them, whether that is
-- a bucket or this database.
--
-- Nothing is orphaned: every existing row's bytes are moved into
-- photo_objects under a key derived from that row, and `url` is backfilled
-- to point at it before the column is dropped. Rows written before this
-- migration keep resolving afterwards through the `inline:` scheme, which
-- stays readable even once a deployment starts writing new photos to S3.
CREATE TABLE "photo_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"media_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The bytes, moved. Keyed by the photo row's own id, so the key is unique
-- by construction and traceable back to the record it came from.
INSERT INTO "photo_objects" ("key", "media_type", "bytes")
SELECT 'photos/' || p."id" || '/' || p."file_name", p."media_type", p."bytes"
FROM "photos" p;--> statement-breakpoint
-- ...and the row pointed at where they went. Joined against the object that
-- actually landed rather than recomputing the key, so a row whose bytes did
-- not move keeps a null url — and the NOT NULL below fails the migration
-- instead of leaving a lead with a photo that 404s.
UPDATE "photos" p
SET "url" = 'inline:' || o."key"
FROM "photo_objects" o
WHERE o."key" = 'photos/' || p."id" || '/' || p."file_name";--> statement-breakpoint
-- The verification, rather than a comment claiming one.
ALTER TABLE "photos" ALTER COLUMN "url" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" DROP COLUMN "bytes";
