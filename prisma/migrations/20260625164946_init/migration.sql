-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "discountType" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Campaign_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "stageNumber" INTEGER NOT NULL,
    "label" TEXT,
    "discountValue" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "CampaignStage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VariantPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "originalPrice" REAL NOT NULL,
    "currentPrice" REAL NOT NULL,
    "snapshotAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "campaignId" TEXT,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ThemeSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "badgeText" TEXT NOT NULL DEFAULT 'Sale',
    "countdownText" TEXT NOT NULL DEFAULT 'Ends in',
    "stageLabelText" TEXT NOT NULL DEFAULT 'Stage',
    "fontSize" INTEGER NOT NULL DEFAULT 14,
    "fontWeight" TEXT NOT NULL DEFAULT '500',
    "salePriceColor" TEXT NOT NULL DEFAULT '#E63946',
    "originalPriceColor" TEXT NOT NULL DEFAULT '#6B7280',
    "badgeBg" TEXT NOT NULL DEFAULT '#E63946',
    "badgeTextColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "padding" INTEGER NOT NULL DEFAULT 12,
    "borderRadius" INTEGER NOT NULL DEFAULT 8,
    "alignment" TEXT NOT NULL DEFAULT 'left',
    "customJs" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ThemeSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchedulerJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_domain_key" ON "Shop"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "VariantPriceSnapshot_shopId_campaignId_variantId_key" ON "VariantPriceSnapshot"("shopId", "campaignId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeSettings_shopId_key" ON "ThemeSettings"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulerJob_stageId_key" ON "SchedulerJob"("stageId");
