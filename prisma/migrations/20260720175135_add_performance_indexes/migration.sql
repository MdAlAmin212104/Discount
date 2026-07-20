-- CreateIndex
CREATE INDEX "ActivityLog_shopId_idx" ON "ActivityLog"("shopId");

-- CreateIndex
CREATE INDEX "ActivityLog_campaignId_idx" ON "ActivityLog"("campaignId");

-- CreateIndex
CREATE INDEX "Campaign_shopId_idx" ON "Campaign"("shopId");

-- CreateIndex
CREATE INDEX "CampaignProduct_campaignId_idx" ON "CampaignProduct"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignStage_campaignId_idx" ON "CampaignStage"("campaignId");

-- CreateIndex
CREATE INDEX "SchedulerJob_shopId_idx" ON "SchedulerJob"("shopId");

-- CreateIndex
CREATE INDEX "SchedulerJob_status_scheduledAt_idx" ON "SchedulerJob"("status", "scheduledAt");
