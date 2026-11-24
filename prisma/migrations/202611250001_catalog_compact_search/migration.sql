-- Compact catalogue storage. "searchText" duplicated title, employer, location,
-- department and the first 6,000 description characters; it is no longer
-- written (src/lib/catalog-text.ts derives it from the columns).
-- No row data is changed or removed here. The old full-text index covered
-- "searchText" and is replaced by a smaller index over title, employer,
-- location, department and the first 6,000 description characters (the same
-- coverage as before, without storing the text twice).
-- Run after the catalogue cleanup: building the index on an empty or small
-- table needs little time and space.
ALTER TABLE "CatalogJob" ALTER COLUMN "searchText" SET DEFAULT '';
DROP INDEX IF EXISTS "CatalogJob_search_idx";
CREATE INDEX "CatalogJob_search_compact_idx" ON "CatalogJob" USING GIN (
  to_tsvector('simple'::regconfig,
    title || ' ' || employer || ' ' || coalesce(location, '') || ' ' ||
    coalesce(department, '') || ' ' || left(coalesce(description, ''), 6000))
);
-- Supports oldest-first retention of active jobs.
CREATE INDEX "CatalogJob_active_posted_idx" ON "CatalogJob" (COALESCE("publishedAt", "firstSeen")) WHERE active;
