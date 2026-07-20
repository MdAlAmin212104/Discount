-- AlterTable
ALTER TABLE "CampaignStage" ADD COLUMN "shopifyDiscountId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ThemeSettings" (
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
    "customCss" TEXT NOT NULL DEFAULT '',
    "sliderItems" INTEGER NOT NULL DEFAULT 3,
    "cartMode" TEXT NOT NULL DEFAULT 'stay',
    "memberLabel" TEXT NOT NULL DEFAULT 'Inner Circle Member',
    "welcomeHeading" TEXT NOT NULL DEFAULT 'Exclusive Access',
    "welcomeEmphasis" TEXT NOT NULL DEFAULT 'Offers',
    "welcomeSubHeading" TEXT NOT NULL DEFAULT 'Members get every release first, before public launch.',
    "productHeading" TEXT NOT NULL DEFAULT 'Selected Pieces',
    "reserveButtonText" TEXT NOT NULL DEFAULT 'Reserve Now',
    "buttonAction" TEXT NOT NULL DEFAULT 'cart',
    "bgColor" TEXT NOT NULL DEFAULT '#f0efeb',
    "textColor" TEXT NOT NULL DEFAULT '#0e0e0d',
    "borderColor" TEXT NOT NULL DEFAULT '#e2dfd9',
    "cardColor" TEXT NOT NULL DEFAULT '#faf9f7',
    "accentColor" TEXT NOT NULL DEFAULT '#1a3a2a',
    "mutedColor" TEXT NOT NULL DEFAULT '#9a9792',
    "paddingTop" INTEGER NOT NULL DEFAULT 40,
    "paddingBottom" INTEGER NOT NULL DEFAULT 40,
    "maxWidth" INTEGER NOT NULL DEFAULT 580,
    "conflictStrategy" TEXT NOT NULL DEFAULT 'HIGHEST_DISCOUNT',
    "publicShipping" TEXT NOT NULL DEFAULT 'Ships in ~5-7 days',
    "setupCampaignCreated" BOOLEAN NOT NULL DEFAULT false,
    "setupThemeAdded" BOOLEAN NOT NULL DEFAULT false,
    "setupThemeCustomized" BOOLEAN NOT NULL DEFAULT false,
    "setupGuideDismissed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ThemeSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ThemeSettings" ("alignment", "badgeBg", "badgeText", "badgeTextColor", "borderRadius", "countdownText", "customJs", "fontSize", "fontWeight", "id", "originalPriceColor", "padding", "salePriceColor", "shopId", "stageLabelText") SELECT "alignment", "badgeBg", "badgeText", "badgeTextColor", "borderRadius", "countdownText", "customJs", "fontSize", "fontWeight", "id", "originalPriceColor", "padding", "salePriceColor", "shopId", "stageLabelText" FROM "ThemeSettings";
DROP TABLE "ThemeSettings";
ALTER TABLE "new_ThemeSettings" RENAME TO "ThemeSettings";
CREATE UNIQUE INDEX "ThemeSettings_shopId_key" ON "ThemeSettings"("shopId");
CREATE TABLE "new_VariantPriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "originalPrice" REAL NOT NULL,
    "originalComparePrice" REAL,
    "currentPrice" REAL NOT NULL,
    "snapshotAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VariantPriceSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VariantPriceSnapshot" ("campaignId", "currentPrice", "id", "originalPrice", "shopId", "snapshotAt", "variantId") SELECT "campaignId", "currentPrice", "id", "originalPrice", "shopId", "snapshotAt", "variantId" FROM "VariantPriceSnapshot";
DROP TABLE "VariantPriceSnapshot";
ALTER TABLE "new_VariantPriceSnapshot" RENAME TO "VariantPriceSnapshot";
CREATE UNIQUE INDEX "VariantPriceSnapshot_shopId_campaignId_variantId_key" ON "VariantPriceSnapshot"("shopId", "campaignId", "variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
