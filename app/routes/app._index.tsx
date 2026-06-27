import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const totalCampaigns = await prisma.campaign.count({ where: { shopId: shop.id } });
  const activeCampaigns = await prisma.campaign.count({ where: { shopId: shop.id, status: "ACTIVE" } });
  const scheduledCampaigns = await prisma.campaign.count({ where: { shopId: shop.id, status: "SCHEDULED" } });
  const completedCampaigns = await prisma.campaign.count({ where: { shopId: shop.id, status: "COMPLETED" } });

  const productsAffected = await prisma.campaignProduct.count({
    where: { campaign: { shopId: shop.id } },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const priceUpdatesToday = await prisma.activityLog.count({
    where: { shopId: shop.id, event: "PRICE_UPDATED", createdAt: { gte: startOfToday } },
  });

  const next24h = new Date();
  next24h.setHours(next24h.getHours() + 24);

  const upcomingJobs = await prisma.schedulerJob.findMany({
    where: { shopId: shop.id, status: "PENDING", scheduledAt: { gte: new Date(), lte: next24h } },
    orderBy: { scheduledAt: "asc" },
  });

  const stageIds = upcomingJobs.map((job) => job.stageId);
  const relatedStages = await prisma.campaignStage.findMany({
    where: { id: { in: stageIds } },
    include: { campaign: { select: { name: true } } },
  });

  const jobDetailsMap = relatedStages.reduce((acc: any, stage) => {
    acc[stage.id] = {
      campaignName: stage.campaign.name,
      stageLabel: stage.label || `Stage ${stage.stageNumber}`,
      discountValue: stage.discountValue,
    };
    return acc;
  }, {});

  const recentlyCompleted = await prisma.campaign.findMany({
    where: { shopId: shop.id, status: "COMPLETED" },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  const activeCampaignsList = await prisma.campaign.findMany({
    where: { shopId: shop.id, status: "ACTIVE" },
    include: { stages: { orderBy: { stageNumber: "asc" } } },
    take: 5,
  });

  const recentLogs = await prisma.activityLog.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { campaign: { select: { name: true } } },
  });

  return {
    stats: { totalCampaigns, activeCampaigns, scheduledCampaigns, completedCampaigns, productsAffected, priceUpdatesToday },
    upcomingJobs: upcomingJobs.map((job) => ({
      ...job,
      details: jobDetailsMap[job.stageId] || null,
    })),
    recentlyCompleted,
    activeCampaignsList,
    recentLogs,
  };
};

function formatTimeAgo(dateInput: Date | string) {
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return "yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const { stats, upcomingJobs, recentlyCompleted, activeCampaignsList, recentLogs } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const getCampaignProgress = (campaign: any) => {
    const now = new Date().getTime();
    const start = new Date(campaign.startDate).getTime();
    const end = new Date(campaign.endDate).getTime();
    if (now <= start) return 0;
    if (now >= end) return 100;
    return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
  };

  const getActiveStage = (campaign: any) => {
    const now = new Date();
    return campaign.stages.find(
      (s: any) => new Date(s.startDate) <= now && new Date(s.endDate) >= now
    ) || campaign.stages[0];
  };

  return (
    <s-page
      heading="Dashboard"
      subtitle="Monitor your discount campaigns and track performance in real-time"
    >
      {/* ── Primary Action ── */}
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/campaigns/new")}
      >
        <s-icon source="plus" />
        New Campaign
      </s-button>

      {/* ── Welcome Banner ── */}
      <s-box paddingBlockEnd="500">
        <s-card>
          <s-bleed>
            <s-box
              background="bg-fill-brand"
              paddingBlock="600"
              paddingInline="600"
              borderRadius="200"
            >
              <s-grid columns={{ xs: 1, sm: 1, md: "2fr 1fr" }} gap="400">
                <s-stack gap="200">
                  <s-text variant="headingXl" as="h2" tone="text-inverse">
                    🚀 Smart Discount Management
                  </s-text>
                  <s-text variant="bodyMd" as="p" tone="text-inverse-secondary">
                    Automate multi-stage pricing strategies and boost your sales with scheduled discount campaigns.
                  </s-text>
                  <s-box paddingBlockStart="200">
                    <s-inline gap="200" wrap="wrap">
                      <s-button
                        variant="primary"
                        tone="success"
                        onClick={() => navigate("/app/campaigns/new")}
                      >
                        Create Campaign
                      </s-button>
                      <s-button
                        variant="secondary"
                        tone="default"
                        onClick={() => navigate("/app/theme-settings")}
                      >
                        Configure Widget
                      </s-button>
                    </s-inline>
                  </s-box>
                </s-stack>
                <s-box display={{ xs: "none", md: "block" }}>
                  <s-stack gap="200" inlineAlign="end">
                    <s-text variant="bodySm" tone="text-inverse-secondary">
                      <s-icon source="checkCircle" tone="text-inverse" size="small" />
                      Active campaigns: {stats.activeCampaigns}
                    </s-text>
                    <s-text variant="bodySm" tone="text-inverse-secondary">
                      <s-icon source="calendar" tone="text-inverse" size="small" />
                      Scheduled: {stats.scheduledCampaigns}
                    </s-text>
                    <s-text variant="bodySm" tone="text-inverse-secondary">
                      <s-icon source="product" tone="text-inverse" size="small" />
                      Products affected: {stats.productsAffected}
                    </s-text>
                  </s-stack>
                </s-box>
              </s-grid>
            </s-box>
          </s-bleed>
        </s-card>
      </s-box>

      {/* ── KPI Metrics Grid ── */}
      <s-box paddingBlockEnd="500">
        <s-grid columns={{ xs: 2, sm: 2, md: 4, lg: 4, xl: 4 }} gap="400">
          
          {/* Active Campaigns */}
          <s-card>
            <s-stack gap="100">
              <s-inline align="space-between" blockAlign="center">
                <s-text variant="bodySm" fontWeight="semibold" tone="subdued">
                  Active Campaigns
                </s-text>
                <s-badge tone="success">Live</s-badge>
              </s-inline>
              <s-text variant="heading2xl" as="p" fontWeight="bold">
                {stats.activeCampaigns}
              </s-text>
              <s-inline gap="100" blockAlign="center">
                <s-icon source="play" tone="success" size="small" />
                <s-text variant="bodySm" tone="subdued">
                  {stats.activeCampaigns === 1 ? "campaign running" : "campaigns running"}
                </s-text>
              </s-inline>
            </s-stack>
          </s-card>

          {/* Scheduled Campaigns */}
          <s-card>
            <s-stack gap="100">
              <s-inline align="space-between" blockAlign="center">
                <s-text variant="bodySm" fontWeight="semibold" tone="subdued">
                  Scheduled
                </s-text>
                <s-badge tone="info">Upcoming</s-badge>
              </s-inline>
              <s-text variant="heading2xl" as="p" fontWeight="bold">
                {stats.scheduledCampaigns}
              </s-text>
              <s-inline gap="100" blockAlign="center">
                <s-icon source="calendar" tone="info" size="small" />
                <s-text variant="bodySm" tone="subdued">
                  awaiting start
                </s-text>
              </s-inline>
            </s-stack>
          </s-card>

          {/* Products Targeted */}
          <s-card>
            <s-stack gap="100">
              <s-inline align="space-between" blockAlign="center">
                <s-text variant="bodySm" fontWeight="semibold" tone="subdued">
                  Products Targeted
                </s-text>
                <s-badge>Total</s-badge>
              </s-inline>
              <s-text variant="heading2xl" as="p" fontWeight="bold">
                {stats.productsAffected}
              </s-text>
              <s-inline gap="100" blockAlign="center">
                <s-icon source="product" size="small" />
                <s-text variant="bodySm" tone="subdued">
                  variants affected
                </s-text>
              </s-inline>
            </s-stack>
          </s-card>

          {/* Today's Updates */}
          <s-card>
            <s-stack gap="100">
              <s-inline align="space-between" blockAlign="center">
                <s-text variant="bodySm" fontWeight="semibold" tone="subdued">
                  Today's Updates
                </s-text>
                <s-badge tone="attention">Today</s-badge>
              </s-inline>
              <s-text variant="heading2xl" as="p" fontWeight="bold">
                {stats.priceUpdatesToday}
              </s-text>
              <s-inline gap="100" blockAlign="center">
                <s-icon source="checkmark" tone="success" size="small" />
                <s-text variant="bodySm" tone="subdued">
                  automatic adjustments
                </s-text>
              </s-inline>
            </s-stack>
          </s-card>

        </s-grid>
      </s-box>

      {/* ── Main Content Area ── */}
      <s-grid columns={{ xs: 1, sm: 1, md: "2fr 1fr", lg: "2fr 1fr" }} gap="500">

        {/* ── LEFT COLUMN ── */}
        <s-stack gap="500">

          {/* Active Campaigns Section */}
          <s-card>
            <s-stack gap="400">
              <s-inline align="space-between" blockAlign="center">
                <s-stack gap="050">
                  <s-text variant="headingMd" fontWeight="semibold">
                    Active Campaigns
                  </s-text>
                  <s-text variant="bodySm" tone="subdued">
                    Currently running promotions on your store
                  </s-text>
                </s-stack>
                <s-button
                  variant="plain"
                  onClick={() => navigate("/app/campaigns")}
                >
                  View all
                  <s-icon source="chevronRight" />
                </s-button>
              </s-inline>

              <s-divider />

              {activeCampaignsList.length === 0 ? (
                <s-box paddingBlock="800" paddingInline="400">
                  <s-empty-state
                    heading="No active campaigns"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <s-text as="p" tone="subdued">
                      Start your first campaign to boost sales with automated discounts.
                    </s-text>
                    <s-button
                      slot="action"
                      variant="primary"
                      onClick={() => navigate("/app/campaigns/new")}
                    >
                      Create Campaign
                    </s-button>
                  </s-empty-state>
                </s-box>
              ) : (
                <s-stack gap="400">
                  {activeCampaignsList.map((campaign: any, idx: number) => {
                    const progress = getCampaignProgress(campaign);
                    const activeStage = getActiveStage(campaign);
                    const discountLabel =
                      campaign.discountType === "PERCENTAGE"
                        ? `${activeStage.discountValue}% OFF`
                        : `$${activeStage.discountValue} OFF`;
                    
                    return (
                      <s-box
                        key={campaign.id}
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <s-stack gap="300">
                          <s-inline align="space-between" blockAlign="start" wrap="wrap" gap="200">
                            <s-stack gap="050">
                              <s-inline gap="100" blockAlign="center">
                                <s-text variant="bodyMd" fontWeight="semibold">
                                  {campaign.name}
                                </s-text>
                                <s-icon source="checkCircle" tone="success" size="small" />
                              </s-inline>
                              <s-text variant="bodySm" tone="subdued">
                                {new Date(campaign.startDate).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })} —{" "}
                                {new Date(campaign.endDate).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </s-text>
                            </s-stack>
                            <s-badge tone="info" size="medium">
                              {activeStage.label || `Stage ${activeStage.stageNumber}`}
                            </s-badge>
                          </s-inline>

                          <s-stack gap="050">
                            <s-inline align="space-between">
                              <s-text variant="bodySm" fontWeight="semibold">
                                {discountLabel}
                              </s-text>
                              <s-text variant="bodySm" tone="subdued">
                                {progress}% complete
                              </s-text>
                            </s-inline>
                            <s-progress-bar
                              progress={progress}
                              tone="highlight"
                              size="medium"
                            />
                          </s-stack>
                        </s-stack>
                      </s-box>
                    );
                  })}
                </s-stack>
              )}
            </s-stack>
          </s-card>

          {/* Activity Log Section */}
          <s-card>
            <s-stack gap="400">
              <s-inline align="space-between" blockAlign="center">
                <s-stack gap="050">
                  <s-text variant="headingMd" fontWeight="semibold">
                    Recent Activity
                  </s-text>
                  <s-text variant="bodySm" tone="subdued">
                    Latest system events and price updates
                  </s-text>
                </s-stack>
                <s-button
                  variant="plain"
                  onClick={() => navigate("/app/activity-logs")}
                >
                  View all
                  <s-icon source="chevronRight" />
                </s-button>
              </s-inline>

              <s-divider />

              {recentLogs.length === 0 ? (
                <s-box paddingBlock="600">
                  <s-stack gap="200" inlineAlign="center">
                    <s-icon source="checkCircle" tone="success" size="large" />
                    <s-text variant="bodyMd" fontWeight="semibold">All quiet</s-text>
                    <s-text variant="bodySm" tone="subdued">
                      No recent activity to display
                    </s-text>
                  </s-stack>
                </s-box>
              ) : (
                <s-stack gap="0">
                  {recentLogs.map((log: any, idx: number) => {
                    const isError = log.event.includes("ERROR");
                    const isConflict = log.event.includes("CONFLICT");
                    const isSuccess = log.event.includes("UPDATED") || log.event.includes("RESTORED");
                    const icon = isError ? "warning" : isConflict ? "attention" : isSuccess ? "checkmark" : "refresh";
                    const iconTone = isError ? "critical" : isConflict ? "warning" : isSuccess ? "success" : "subdued";
                    
                    return (
                      <s-box
                        key={log.id}
                        paddingBlock="300"
                        paddingInline="0"
                        borderBlockStartWidth={idx !== 0 ? "025" : "0"}
                        borderColor="border-secondary"
                      >
                        <s-inline gap="200" blockAlign="start">
                          <s-icon source={icon} tone={iconTone} size="small" />
                          <s-stack gap="050" inlineAlign="start" fill>
                            <s-inline align="space-between" wrap="wrap" gap="100">
                              <s-text variant="bodyMd">{log.message}</s-text>
                              <s-text variant="bodySm" tone="subdued">
                                {formatTimeAgo(log.createdAt)}
                              </s-text>
                            </s-inline>
                            {log.campaign?.name && (
                              <s-text variant="bodySm" tone="subdued">
                                Campaign: {log.campaign.name}
                              </s-text>
                            )}
                          </s-stack>
                        </s-inline>
                      </s-box>
                    );
                  })}
                </s-stack>
              )}
            </s-stack>
          </s-card>

        </s-stack>

        {/* ── RIGHT SIDEBAR ── */}
        <s-stack gap="500">

          {/* Upcoming Events Card */}
          <s-card>
            <s-stack gap="400">
              <s-inline align="space-between" blockAlign="center">
                <s-stack gap="050">
                  <s-text variant="headingMd" fontWeight="semibold">
                    Upcoming Events
                  </s-text>
                  <s-text variant="bodySm" tone="subdued">
                    Next 24 hours
                  </s-text>
                </s-stack>
                <s-badge tone="attention">
                  {upcomingJobs.length}
                </s-badge>
              </s-inline>

              <s-divider />

              {upcomingJobs.length === 0 ? (
                <s-box paddingBlock="400">
                  <s-stack gap="200" inlineAlign="center">
                    <s-icon source="checkCircle" tone="success" size="large" />
                    <s-text variant="bodyMd" fontWeight="semibold">No pending updates</s-text>
                    <s-text variant="bodySm" tone="subdued" textAlign="center">
                      All scheduled discounts are up to date
                    </s-text>
                  </s-stack>
                </s-box>
              ) : (
                <s-stack gap="0">
                  {upcomingJobs.map((job: any, idx: number) => (
                    <s-box
                      key={job.id}
                      paddingBlock="300"
                      paddingInline="0"
                      borderBlockStartWidth={idx !== 0 ? "025" : "0"}
                      borderColor="border-secondary"
                    >
                      <s-stack gap="050">
                        <s-inline align="space-between" wrap="wrap" gap="100">
                          <s-text variant="bodyMd" fontWeight="semibold">
                            {job.details?.campaignName || "Discount Update"}
                          </s-text>
                          <s-badge size="small" tone="info">
                            {new Date(job.scheduledAt).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </s-badge>
                        </s-inline>
                        <s-text variant="bodySm" tone="subdued">
                          {job.details?.stageLabel || "Stage update"} ·{" "}
                          {job.details 
                            ? `${job.details.discountValue}% off` 
                            : "Price adjustment"}
                        </s-text>
                      </s-stack>
                    </s-box>
                  ))}
                </s-stack>
              )}
            </s-stack>
          </s-card>

          {/* Completed Campaigns Card */}
          <s-card>
            <s-stack gap="400">
              <s-inline align="space-between" blockAlign="center">
                <s-stack gap="050">
                  <s-text variant="headingMd" fontWeight="semibold">
                    Completed
                  </s-text>
                  <s-text variant="bodySm" tone="subdued">
                    Recently finished campaigns
                  </s-text>
                </s-stack>
                <s-badge tone="success">
                  {recentlyCompleted.length}
                </s-badge>
              </s-inline>

              <s-divider />

              {recentlyCompleted.length === 0 ? (
                <s-box paddingBlock="400">
                  <s-stack gap="200" inlineAlign="center">
                    <s-icon source="calendar" size="large" />
                    <s-text variant="bodyMd" fontWeight="semibold">No completed campaigns</s-text>
                    <s-text variant="bodySm" tone="subdued">
                      Finished campaigns will appear here
                    </s-text>
                  </s-stack>
                </s-box>
              ) : (
                <s-stack gap="0">
                  {recentlyCompleted.map((campaign: any, idx: number) => (
                    <s-box
                      key={campaign.id}
                      paddingBlock="300"
                      paddingInline="0"
                      borderBlockStartWidth={idx !== 0 ? "025" : "0"}
                      borderColor="border-secondary"
                    >
                      <s-stack gap="050">
                        <s-inline align="space-between" wrap="wrap" gap="100">
                          <s-text variant="bodyMd" fontWeight="semibold">
                            {campaign.name}
                          </s-text>
                          <s-badge tone="success" size="small">
                            ✓ Done
                          </s-badge>
                        </s-inline>
                        <s-text variant="bodySm" tone="subdued">
                          Ended {new Date(campaign.endDate).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </s-text>
                      </s-stack>
                    </s-box>
                  ))}
                </s-stack>
              )}
            </s-stack>
          </s-card>

          {/* Quick Stats Card */}
          <s-card>
            <s-stack gap="300">
              <s-text variant="headingSm" fontWeight="semibold">
                Campaign Summary
              </s-text>
              
              <s-divider />
              
              <s-stack gap="200">
                <s-inline align="space-between" blockAlign="center">
                  <s-text variant="bodySm" tone="subdued">Total Campaigns</s-text>
                  <s-text variant="bodyMd" fontWeight="bold">
                    {stats.totalCampaigns}
                  </s-text>
                </s-inline>
                
                <s-inline align="space-between" blockAlign="center">
                  <s-text variant="bodySm" tone="subdued">Active</s-text>
                  <s-badge tone="success">
                    {stats.activeCampaigns}
                  </s-badge>
                </s-inline>
                
                <s-inline align="space-between" blockAlign="center">
                  <s-text variant="bodySm" tone="subdued">Scheduled</s-text>
                  <s-badge tone="info">
                    {stats.scheduledCampaigns}
                  </s-badge>
                </s-inline>
                
                <s-inline align="space-between" blockAlign="center">
                  <s-text variant="bodySm" tone="subdued">Completed</s-text>
                  <s-badge tone="default">
                    {stats.completedCampaigns}
                  </s-badge>
                </s-inline>
                
                <s-inline align="space-between" blockAlign="center">
                  <s-text variant="bodySm" tone="subdued">Products Affected</s-text>
                  <s-text variant="bodyMd" fontWeight="bold">
                    {stats.productsAffected}
                  </s-text>
                </s-inline>
              </s-stack>
            </s-stack>
          </s-card>

        </s-stack>

      </s-grid>
    </s-page>
  );
}