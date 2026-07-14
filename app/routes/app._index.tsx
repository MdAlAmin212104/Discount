import { Suspense } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, Await } from "react-router";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const next24h = new Date();
  next24h.setHours(next24h.getHours() + 24);

  return {
    stats: (async () => {
      const totalCampaigns = await prisma.campaign.count({ where: { shopId: shop.id } });
      const activeCampaigns = await prisma.campaign.count({ where: { shopId: shop.id, status: "ACTIVE" } });
      const scheduledCampaigns = await prisma.campaign.count({ where: { shopId: shop.id, status: "SCHEDULED" } });
      const completedCampaigns = await prisma.campaign.count({ where: { shopId: shop.id, status: "COMPLETED" } });
      const productsAffected = await prisma.campaignProduct.count({ where: { campaign: { shopId: shop.id } } });
      const priceUpdatesToday = await prisma.activityLog.count({
        where: { shopId: shop.id, event: "PRICE_UPDATED", createdAt: { gte: startOfToday } },
      });
      return { totalCampaigns, activeCampaigns, scheduledCampaigns, completedCampaigns, productsAffected, priceUpdatesToday };
    })(),
    upcomingJobs: (async () => {
      const jobs = await prisma.schedulerJob.findMany({
        where: { shopId: shop.id, status: "PENDING", scheduledAt: { gte: new Date(), lte: next24h } },
        orderBy: { scheduledAt: "asc" },
      });
      const stageIds = jobs.map((job) => job.stageId);
      const relatedStages = await prisma.campaignStage.findMany({
        where: { id: { in: stageIds } },
        include: { campaign: { select: { id: true, name: true, discountType: true } } },
      });
      const jobDetailsMap = relatedStages.reduce((acc: any, stage) => {
        acc[stage.id] = {
          campaignId: stage.campaign.id,
          campaignName: stage.campaign.name,
          discountType: stage.campaign.discountType,
          stageLabel: stage.label || `Stage ${stage.stageNumber}`,
          discountValue: stage.discountValue,
        };
        return acc;
      }, {});
      return jobs.map((job) => ({
        ...job,
        details: jobDetailsMap[job.stageId] || null,
      }));
    })(),
    recentlyCompleted: Promise.resolve(prisma.campaign.findMany({
      where: { shopId: shop.id, status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      take: 5,
    })),
    activeCampaignsList: Promise.resolve(prisma.campaign.findMany({
      where: { shopId: shop.id, status: "ACTIVE" },
      include: { stages: { orderBy: { stageNumber: "asc" } } },
      take: 5,
    })),
  };
};

function KPICard({ title, value, icon, subtext, badgeText, badgeTone }: {
  title: string;
  value: string | number;
  icon: string;
  subtext: string;
  badgeText?: string;
  badgeTone?: "success" | "info" | "caution" | "neutral";
}) {
  return (
    <s-box padding="base" borderRadius="base" borderWidth="base">
      <s-stack gap="base">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-text color="subdued">
            <strong>{title}</strong>
          </s-text>
          {badgeText && <s-badge tone={badgeTone}>{badgeText}</s-badge>}
        </s-stack>
        <s-heading>
          {value}
        </s-heading>
        <s-stack direction="inline" gap="small" alignItems="center" justifyContent="start">
          <s-icon type={icon as any} size="small" />
          <s-text color="subdued">
            {subtext}
          </s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

function KPIsSkeleton() {
  return (
    <s-section>
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
        {[1, 2, 3, 4, 5].map((i) => (
          <s-card key={i}>
            <s-box padding="base">
              <s-stack gap="base">
                <s-stack direction="inline" justifyContent="space-between">
                  <s-text color="subdued">Loading metric...</s-text>
                </s-stack>
                <s-text>—</s-text>
                <s-text color="subdued">Calculating...</s-text>
              </s-stack>
            </s-box>
          </s-card>
        ))}
      </s-grid>
    </s-section>
  );
}

function KPIsGrid({ stats }: { stats: any }) {
  return (
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="small">
        <KPICard
          title="Active Campaigns"
          value={stats.activeCampaigns}
          icon="play-circle"
          subtext={`${stats.activeCampaigns} live campaigns`}
          badgeText="Live"
          badgeTone="success"
        />
        <KPICard
          title="Scheduled"
          value={stats.scheduledCampaigns}
          icon="calendar-time"
          subtext={`${stats.scheduledCampaigns} upcoming`}
          badgeText="Upcoming"
          badgeTone="info"
        />
        <KPICard
          title="Products Affected"
          value={stats.productsAffected}
          icon="product"
          subtext="total variant count"
          badgeText="Total"
          badgeTone="neutral"
        />
        <KPICard
          title="Today's Updates"
          value={stats.priceUpdatesToday}
          icon="price-list"
          subtext="price adjustments"
          badgeText="Today"
          badgeTone="caution"
        />
      </s-grid>
  );
}

function ActiveCampaignsSkeleton() {
  return (
      <s-box padding="base">
        <s-stack gap="base">
          <s-text><strong>Loading campaigns...</strong></s-text>
          <s-divider />
          {[1, 2].map((i) => (
            <s-box key={i} padding="base" background="subdued" borderRadius="base">
              <s-stack gap="base">
                <s-stack direction="inline" justifyContent="space-between">
                  <s-text color="subdued">Synchronizing schedule data...</s-text>
                </s-stack>
                <s-text color="subdued">Updating progress state...</s-text>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-box>
  );
}

function ActiveCampaignsSection({ campaigns, getCampaignProgress, getActiveStage, navigate }: any) {
  return (
    <s-box >
      <s-stack gap="base">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-stack gap="small">
            <s-heading>Active Campaigns</s-heading>
            <s-text color="subdued">
              Currently running promotions on your store
            </s-text>
          </s-stack>
          <s-button variant="tertiary" onClick={() => navigate("/app/campaigns")}>
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text>View all</s-text>
              <s-icon type="chevron-right" size="small" />
            </s-stack>
          </s-button>
        </s-stack>

        <s-divider />

        {campaigns.length === 0 ? (
          <s-box paddingBlock="large" paddingInline="base">
            <s-empty-state
              heading="No active campaigns"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <s-text color="subdued">
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
          <s-stack gap="base">
            {campaigns.map((campaign: any) => {
              const progress = getCampaignProgress(campaign);
              const activeStage = getActiveStage(campaign);
              const discountLabel =
                campaign.discountType === "PERCENTAGE"
                  ? `${activeStage?.discountValue || 0}% OFF`
                  : `$${activeStage?.discountValue || 0} OFF`;

              let stageTitle = "";
              let stageSubtitle = "";
              if (activeStage) {
                stageTitle = `Stage ${activeStage.stageNumber}`;
                stageSubtitle = activeStage.label || "";
                if (activeStage.label) {
                  try {
                    const parsed = JSON.parse(activeStage.label);
                    if (parsed && typeof parsed === "object") {
                      stageTitle = parsed.phaseTitle || `Stage ${activeStage.stageNumber}`;
                      stageSubtitle = parsed.label || "";
                    }
                  } catch (e) {
                    // Fallback to defaults
                  }
                }
              }

              return (
                <s-clickable
                  key={campaign.id}
                  onClick={() => navigate(`/app/campaigns/${campaign.id}`)}
                >
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    <s-stack gap="base">
                      <s-stack direction="inline" justifyContent="space-between" alignItems="start" gap="base">
                        <s-stack gap="small">
                          <s-stack direction="inline" gap="small" alignItems="center">
                            <s-text>
                              <strong>{campaign.name}</strong>
                            </s-text>
                            <s-icon type="check-circle" tone="success" size="small" />
                          </s-stack>
                          <s-text color="subdued">
                            {new Date(campaign.startDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}{" "}
                            —{" "}
                            {new Date(campaign.endDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </s-text>
                        </s-stack>
                        {activeStage && (
                          <s-stack direction="block" gap="none" alignItems="end">
                            <s-badge tone="info">
                              {stageTitle}
                            </s-badge>
                            {stageSubtitle && (
                              <s-box paddingBlockStart="small">
                                <s-text color="subdued">
                                  {stageSubtitle}
                                </s-text>
                              </s-box>
                            )}
                          </s-stack>
                        )}
                      </s-stack>

                      <s-stack gap="small">
                        <s-stack direction="inline" justifyContent="space-between">
                          <s-text>
                            <strong>{discountLabel}</strong>
                          </s-text>
                          <s-text color="subdued">
                            {progress}% complete
                          </s-text>
                        </s-stack>
                        <s-progress-bar
                          progress={progress}
                          tone="highlight"
                          size="medium"
                        />
                      </s-stack>
                    </s-stack>
                  </s-box>
                </s-clickable>
              );
            })}
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

function ListSkeleton() {
  return (
    <s-card>
      <s-box padding="base">
        <s-stack gap="base">
          <s-text><strong>Loading...</strong></s-text>
          <s-divider />
          {[1, 2].map((i) => (
            <s-box key={i} paddingBlock="base" paddingInline="none">
              <s-stack gap="base">
                <s-text color="subdued">Loading campaign details...</s-text>
                <s-text color="subdued">Please wait...</s-text>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-box>
    </s-card>
  );
}

function UpcomingEventsSection({ upcomingJobs }: any) {
  const navigate = useNavigate();
  return (
      <s-box>
        <s-stack gap="base">
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-stack gap="small">
              <s-heading>Upcoming Events</s-heading>
              <s-text color="subdued">
                Next 24 hours
              </s-text>
            </s-stack>
            <s-badge tone="caution">
              {upcomingJobs.length}
            </s-badge>
          </s-stack>

          <s-divider />

          {upcomingJobs.length === 0 ? (
            <s-box paddingBlock="base">
              <s-stack gap="base" alignItems="center">
                <s-icon type="check-circle" tone="success" size="base" />
                <s-text>
                  <strong>No pending updates</strong>
                </s-text>
                <s-text color="subdued">
                  All scheduled discounts are up to date
                </s-text>
              </s-stack>
            </s-box>
          ) : (
            <s-stack gap="base">
              {upcomingJobs.map((job: any) => {
                const discountLabel = job.details
                  ? job.details.discountType === "PERCENTAGE"
                    ? `${job.details.discountValue}% OFF`
                    : `$${job.details.discountValue} OFF`
                  : "Price adjustment";

                let stageTitle = "Stage Update";
                let stageSubtitle = job.details?.stageLabel || "";
                if (job.details?.stageLabel) {
                  try {
                    const parsed = JSON.parse(job.details.stageLabel);
                    if (parsed && typeof parsed === "object") {
                      stageTitle = parsed.phaseTitle || "Stage Update";
                      stageSubtitle = parsed.label || "";
                    }
                  } catch (e) {
                    // Fallback
                  }
                }

                return (
                  <s-clickable
                    key={job.id}
                    onClick={() => {
                      if (job.details?.campaignId) {
                        navigate(`/app/campaigns/${job.details.campaignId}`);
                      }
                    }}
                  >
                    <s-box
                      padding="base"
                      background="subdued"
                      borderRadius="base"
                    >
                      <s-stack gap="base">
                        <s-stack direction="inline" justifyContent="space-between" alignItems="start" gap="base">
                          <s-stack gap="small">
                            <s-stack direction="inline" gap="small" alignItems="center">
                              <s-text>
                                <strong>{job.details?.campaignName || "Discount Update"}</strong>
                              </s-text>
                            </s-stack>
                            <s-text color="subdued">
                              {new Date(job.scheduledAt).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </s-text>
                          </s-stack>

                          <s-stack direction="block" gap="none" alignItems="end">
                            <s-badge tone="info">
                              {stageTitle}
                            </s-badge>
                            {stageSubtitle && (
                              <s-box paddingBlockStart="small">
                                <s-text color="subdued">
                                  {stageSubtitle}
                                </s-text>
                              </s-box>
                            )}
                          </s-stack>
                        </s-stack>

                        <s-stack gap="small">
                          <s-stack direction="inline" justifyContent="space-between">
                            <s-text>
                              <strong>{discountLabel}</strong>
                            </s-text>
                          </s-stack>
                        </s-stack>
                      </s-stack>
                    </s-box>
                  </s-clickable>
                );
              })}
            </s-stack>
          )}
        </s-stack>
        
      </s-box>
  );
}

function RecentlyCompletedSection({ recentlyCompleted }: any) {
  const navigate = useNavigate();
  return (
      <s-box paddingBlock="base">
        <s-stack gap="base">
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-stack gap="small">
              <s-heading>Completed</s-heading>
              <s-text color="subdued">
                Recently finished campaigns
              </s-text>
            </s-stack>
            <s-badge tone="success">
              {recentlyCompleted.length}
            </s-badge>
          </s-stack>

          <s-divider />

          {recentlyCompleted.length === 0 ? (
            <s-box paddingBlock="base">
              <s-stack gap="base" alignItems="center">
                <s-icon type="calendar" size="base" />
                <s-text>
                  <strong>No completed campaigns</strong>
                </s-text>
                <s-text color="subdued">
                  Finished campaigns will appear here
                </s-text>
              </s-stack>
            </s-box>
          ) : (
            <s-stack gap="base">
              {recentlyCompleted.map((campaign: any) => (
                <s-clickable
                  key={campaign.id}
                  onClick={() => navigate(`/app/campaigns/${campaign.id}`)}
                >
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    <s-stack gap="base">
                      <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                        <s-stack gap="small">
                          <s-text>
                            <strong>{campaign.name}</strong>
                          </s-text>
                          <s-text color="subdued">
                            Ended {new Date(campaign.endDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </s-text>
                        </s-stack>
                        <s-badge tone="success">
                          ✓ Done
                        </s-badge>
                      </s-stack>
                    </s-stack>
                  </s-box>
                </s-clickable>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-box>
  );
}

export default function Dashboard() {
  const { stats, upcomingJobs, recentlyCompleted, activeCampaignsList } = useLoaderData() as any;
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
    <s-page heading="Dashboard">
      {/* ── Primary Action ── */}
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/campaigns/new")}
      >
        <s-icon type="plus" />
        New Campaign
      </s-button>

      {/* ── KPI Metrics Grid ── */}
      <s-section>
        <Suspense fallback={<KPIsSkeleton />}>
          <Await resolve={stats}>
            {(resolvedStats) => <KPIsGrid stats={resolvedStats} />}
          </Await>
        </Suspense>
      </s-section>

      {/* ── Main Content Area ── */}
      <s-section>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(320px, 1fr))" gap="small">
          {/* ── LEFT COLUMN ── */}
          <s-stack>
            <Suspense fallback={<ActiveCampaignsSkeleton />}>
              <Await resolve={activeCampaignsList}>
                {(resolvedList) => (
                  <ActiveCampaignsSection
                    campaigns={resolvedList}
                    getCampaignProgress={getCampaignProgress}
                    getActiveStage={getActiveStage}
                    navigate={navigate}
                  />
                )}
              </Await>
            </Suspense>
          </s-stack>

          {/* ── RIGHT SIDEBAR ── */}
          <s-stack>
            <Suspense fallback={<ListSkeleton />}>
              <Await resolve={upcomingJobs}>
                {(resolvedJobs) => <UpcomingEventsSection upcomingJobs={resolvedJobs} />}
              </Await>
            </Suspense>

            <Suspense fallback={<ListSkeleton />}>
              <Await resolve={recentlyCompleted}>
                {(resolvedCompleted) => <RecentlyCompletedSection recentlyCompleted={resolvedCompleted} />}
              </Await>
            </Suspense>
          </s-stack>
        </s-grid>
      </s-section>
      
    </s-page>
  );
}