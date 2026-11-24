import { Prisma } from "@prisma/client";

/*
 * Catalogue text is derived from the stored columns instead of being stored a
 * second time. "searchText" used to duplicate title, employer, location,
 * department and the first 6,000 description characters (about 2.8 KB per
 * job); it is now always empty and kept only so the schema change stays
 * additive.
 */

// Text used for skill keys, exclusions and regex filters (unchanged coverage).
export const MATCH_DESCRIPTION_CHARS = 6000;
// Coverage of the compact full-text index. Must equal the expression in
// prisma/migrations/202611250001_catalog_compact_search/migration.sql.
export const FTS_DESCRIPTION_CHARS = 6000;

type CatalogTextFields = {
  title: string;
  employer: string;
  location?: string | null;
  department?: string | null;
  description?: string | null;
};

export function catalogSearchText(job: CatalogTextFields) {
  return [
    job.title,
    job.employer,
    job.location,
    job.department,
    job.description?.slice(0, MATCH_DESCRIPTION_CHARS),
  ]
    .filter(Boolean)
    .join("\n");
}

// Aliases are fixed identifiers chosen by the code, never user input.
const alias = (a: "j") => a;

/** SQL equivalent of catalogSearchText for regex filters (not indexed). */
export function catalogTextSql(a: "j" = "j") {
  const t = alias(a);
  return Prisma.raw(
    `concat_ws(E'\\n', ${t}.title, ${t}.employer, ${t}.location, ${t}.department, left(${t}.description, ${MATCH_DESCRIPTION_CHARS}))`,
  );
}

/** Matches the compact GIN index expression exactly, so the index is used. */
export function catalogFtsSql(a: "j" = "j") {
  const t = alias(a);
  return Prisma.raw(
    `to_tsvector('simple'::regconfig, ${t}.title || ' ' || ${t}.employer || ' ' || coalesce(${t}.location, '') || ' ' || coalesce(${t}.department, '') || ' ' || left(coalesce(${t}.description, ''), ${FTS_DESCRIPTION_CHARS}))`,
  );
}
