-- Keep derived keys tied to the exact public content snapshot across deployments.
ALTER TABLE "CatalogJob" ADD COLUMN "skillKeysHash" TEXT;
