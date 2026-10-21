CREATE TABLE "AiConnection" (
  "workspaceId" TEXT NOT NULL DEFAULT 'local',
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "keyCiphertext" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiConnection_pkey" PRIMARY KEY ("workspaceId")
);
