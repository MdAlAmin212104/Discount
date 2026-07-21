import { Suspense, useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, Await, useSubmit, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import { SetupGuide } from "../components/SetupGuide";

function getStartOfTodayInTz(ianaTimezone: string): Date {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value || "1970";
    const m = parts.find((p) => p.type === "month")?.value || "01";
    const d = parts.find((p) => p.type === "day")?.value || "01";

    const offsetFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      timeZoneName: "longOffset",
    });
    const offsetParts = offsetFormatter.formatToParts(new Date());
    const tzPart = offsetParts.find((p) => p.type === "timeZoneName")?.value || "GMT";
    
    let offset = "+00:00";
    if (tzPart !== "GMT") {
      const cleaned = tzPart.replace("GMT", "");
      const match = cleaned.match(/^([+-])(\d+)(?::(\d+))?$/);
      if (match) {
        const sign = match[1];
        const hours = match[2].padStart(2, "0");
        const minutes = (match[3] || "00").padStart(2, "0");
        offset = `${sign}${hours}:${minutes}`;
      }
    }
    return new Date(`${y}-${m}-${d}T00:00:00.000${offset}`);
  } catch (e) {
    console.error("Error calculating start of today in timezone:", e);
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  // Fast concurrent query for critical UI configuration flags
  const [themeSettings, campaignCount] = await Promise.all([
    prisma.themeSettings.findUnique({ where: { shopId: shop.id } }),
    prisma.campaign.count({ where: { shopId: shop.id } }),
  ]);

  let updatedThemeSettings = themeSettings;
  if (campaignCount > 0 && themeSettings && !themeSettings.setupCampaignCreated) {
    updatedThemeSettings = { ...themeSettings, setupCampaignCreated: true };
    // Non-blocking background sync so loader returns instantly without side-effect latency
    prisma.themeSettings.update({
      where: { shopId: shop.id },
      data: { setupCampaignCreated: true },
    }).catch((err) => console.error("Non-blocking themeSettings update error:", err));
  }

  const next24h = new Date();
  next24h.setHours(next24h.getHours() + 24);

  return {
    shopDomain: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
    themeSettings: updatedThemeSettings,

    // Streaming Deferred Data #1: Dashboard Stats (with Timezone fetching & Promise.all)
    stats: (async () => {
      try {
        let ianaTimezone = "UTC";
        try {
          const responseShop = await admin.graphql(`#graphql
            query getShopTimezone {
              shop { ianaTimezone }
            }`);
          const shopJson = await responseShop.json();
          ianaTimezone = shopJson.data?.shop?.ianaTimezone || "UTC";
        } catch (e) {
          console.error("Failed to fetch shop timezone from Shopify:", e);
        }

        const startOfToday = getStartOfTodayInTz(ianaTimezone);

        const [activeCampaigns, scheduledCampaigns, productsAffected, priceUpdatesToday] = await Promise.all([
          prisma.campaign.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
          prisma.campaign.count({ where: { shopId: shop.id, status: "SCHEDULED" } }),
          prisma.campaignProduct.count({ where: { campaign: { shopId: shop.id } } }),
          prisma.activityLog.count({
            where: { shopId: shop.id, event: "PRICE_UPDATED", createdAt: { gte: startOfToday } },
          }),
        ]);

        return { activeCampaigns, scheduledCampaigns, productsAffected, priceUpdatesToday };
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
        return { activeCampaigns: 0, scheduledCampaigns: 0, productsAffected: 0, priceUpdatesToday: 0 };
      }
    })(),

    // Streaming Deferred Data #2: Upcoming Jobs
    upcomingJobs: (async () => {
      try {
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
      } catch (error) {
        console.error("Failed to fetch upcoming jobs:", error);
        return [];
      }
    })(),

    // Streaming Deferred Data #3: Recently Completed Campaigns
    recentlyCompleted: (async () => {
      try {
        return await prisma.campaign.findMany({
          where: { shopId: shop.id, status: "COMPLETED" },
          orderBy: { updatedAt: "desc" },
        });
      } catch (error) {
        console.error("Failed to fetch recently completed campaigns:", error);
        return [];
      }
    })(),

    // Streaming Deferred Data #4: Active Campaigns List
    activeCampaignsList: (async () => {
      try {
        return await prisma.campaign.findMany({
          where: { shopId: shop.id, status: "ACTIVE" },
          include: { stages: { orderBy: { stageNumber: "asc" } } },
        });
      } catch (error) {
        console.error("Failed to fetch active campaigns list:", error);
        return [];
      }
    })(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = await getOrCreateShop(session.shop, session.accessToken || "");
    const formData = await request.formData();
    const actionType = formData.get("actionType");

    if (actionType === "updateSetupStep") {
      const stepId = formData.get("stepId");
      const complete = formData.get("complete") === "true";

      const updateData: any = {};
      if (stepId === "campaign") updateData.setupCampaignCreated = complete;
      if (stepId === "theme") updateData.setupThemeAdded = complete;
      if (stepId === "customize") updateData.setupThemeCustomized = complete;

      try {
        const updated = await prisma.themeSettings.update({
          where: { shopId: shop.id },
          data: updateData,
        });

        const redirectTo = formData.get("redirectTo")?.toString();
        if (redirectTo) {
          return redirect(redirectTo);
        }
        return { success: true, themeSettings: updated };
      } catch (error) {
        console.error("Failed to update setup step theme settings:", error);
        return { success: false, error: "Failed to update setup step settings" };
      }
    }

    if (actionType === "dismissSetupGuide") {
      const dismissed = formData.get("dismissed") === "true";
      try {
        const updated = await prisma.themeSettings.update({
          where: { shopId: shop.id },
          data: { setupGuideDismissed: dismissed },
        });
        return { success: true, themeSettings: updated };
      } catch (error) {
        console.error("Failed to dismiss setup guide theme settings:", error);
        return { success: false, error: "Failed to dismiss setup guide" };
      }
    }

    return { success: false, error: "Unknown action" };
  } catch (globalError) {
    console.error("Global action error in dashboard:", globalError);
    return { success: false, error: "Internal server error" };
  }
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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(campaigns.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCampaigns = campaigns.slice(startIndex, endIndex);

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
          <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
            <s-box maxInlineSize="200px" maxBlockSize="200px">
              {/* aspectRatio should match the actual image dimensions (width/height) */}
              <s-image
                aspectRatio="1/0.5"
                src="https://cdn.shopify.com/static/images/polaris/patterns/callout.png"
                alt="A stylized graphic of four characters, each holding a puzzle piece"
              />
            </s-box>
            <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
              <s-stack alignItems="center">
                <s-heading>Start creating campaigns</s-heading>
                <s-paragraph>
                  Start your first campaign to boost sales with automated discounts.
                </s-paragraph>
              </s-stack>
              <s-button-group>
                <s-button
                  slot="secondary-actions"
                  aria-label="learn More"
                  onClick={() => navigate("/app/theme-settings")}
                >
                  Learn more
                </s-button>
                <s-button slot="primary-action" aria-label="Create Campaign" onClick={() => navigate("/app/campaigns/new")}>
                  Create Campaign
                </s-button>
              </s-button-group>
            </s-grid>
          </s-grid>
        ) : (
          <s-stack gap="base">
            {paginatedCampaigns.map((campaign: any) => {
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
              const displayTitle = stageTitle.length > 20 ? stageTitle.substring(0, 20) + "..." : stageTitle;
              const displaySubtitle = stageSubtitle.length > 20 ? stageSubtitle.substring(0, 20) + "..." : stageSubtitle;

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
                              {displayTitle}
                            </s-badge>
                            {displaySubtitle && (
                              <s-box paddingBlockStart="small">
                                <s-text color="subdued">
                                  {displaySubtitle}
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

            {totalPages > 1 && (
              <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="small" justifyContent="center" alignItems="center">
                  <s-button
                    disabled={currentPage === 1 ? true : undefined}
                    onClick={(e: any) => { e.preventDefault(); if (currentPage > 1) setCurrentPage(currentPage - 1); }}
                  >
                    Previous
                  </s-button>
                  <s-text>Page {currentPage} of {totalPages}</s-text>
                  <s-button
                    disabled={currentPage === totalPages ? true : undefined}
                    onClick={(e: any) => { e.preventDefault(); if (currentPage < totalPages) setCurrentPage(currentPage + 1); }}
                  >
                    Next
                  </s-button>
                </s-stack>
              </s-box>
            )}
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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(upcomingJobs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedJobs = upcomingJobs.slice(startIndex, endIndex);

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
            {paginatedJobs.map((job: any) => {
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
              const displayTitle = stageTitle.length > 20 ? stageTitle.substring(0, 20) + "..." : stageTitle;
              const displaySubtitle = stageSubtitle.length > 20 ? stageSubtitle.substring(0, 20) + "..." : stageSubtitle;

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
                            {displayTitle}
                          </s-badge>
                          {displaySubtitle && (
                            <s-box paddingBlockStart="small">
                              <s-text color="subdued">
                                {displaySubtitle}
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

            {totalPages > 1 && (
              <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="small" justifyContent="center" alignItems="center">
                  <s-button
                    disabled={currentPage === 1 ? true : undefined}
                    onClick={(e: any) => { e.preventDefault(); if (currentPage > 1) setCurrentPage(currentPage - 1); }}
                  >
                    Previous
                  </s-button>
                  <s-text>Page {currentPage} of {totalPages}</s-text>
                  <s-button
                    disabled={currentPage === totalPages ? true : undefined}
                    onClick={(e: any) => { e.preventDefault(); if (currentPage < totalPages) setCurrentPage(currentPage + 1); }}
                  >
                    Next
                  </s-button>
                </s-stack>
              </s-box>
            )}
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

function RecentlyCompletedSection({ recentlyCompleted }: any) {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(recentlyCompleted.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCompleted = recentlyCompleted.slice(startIndex, endIndex);

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
            {paginatedCompleted.map((campaign: any) => (
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

            {totalPages > 1 && (
              <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="small" justifyContent="center" alignItems="center">
                  <s-button
                    disabled={currentPage === 1 ? true : undefined}
                    onClick={(e: any) => { e.preventDefault(); if (currentPage > 1) setCurrentPage(currentPage - 1); }}
                  >
                    Previous
                  </s-button>
                  <s-text>Page {currentPage} of {totalPages}</s-text>
                  <s-button
                    disabled={currentPage === totalPages ? true : undefined}
                    onClick={(e: any) => { e.preventDefault(); if (currentPage < totalPages) setCurrentPage(currentPage + 1); }}
                  >
                    Next
                  </s-button>
                </s-stack>
              </s-box>
            )}
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

const campaignSvg = `<svg viewBox="0 0 160 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <rect width="160" height="120" rx="8" fill="#F4F6F8"/>
  <circle cx="120" cy="40" r="28" fill="#E2F1EB" opacity="0.6"/>
  <circle cx="40" cy="90" r="16" fill="#E2F1EB" opacity="0.4"/>
  <rect x="25" y="25" width="110" height="70" rx="6" fill="#FFFFFF" stroke="#E1E3E5" stroke-width="1.5"/>
  <line x1="35" y1="38" x2="75" y2="38" stroke="#8C9196" stroke-width="3" stroke-linecap="round"/>
  <line x1="35" y1="46" x2="60" y2="46" stroke="#C9CCCF" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="35" y="58" width="24" height="24" rx="4" fill="#F1F2F4"/>
  <text x="47" y="74" font-family="-apple-system, sans-serif" font-size="10" font-weight="bold" fill="#5C5F62" text-anchor="middle">30%</text>
  <path d="M64 70 L69 70 M67 67 L70 70 L67 73" stroke="#8C9196" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="74" y="58" width="24" height="24" rx="4" fill="#E2F1EB"/>
  <text x="86" y="74" font-family="-apple-system, sans-serif" font-size="10" font-weight="bold" fill="#008060" text-anchor="middle">20%</text>
  <path d="M103 70 L108 70 M106 67 L109 70 L106 73" stroke="#8C9196" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="113" y="58" width="16" height="24" rx="4" fill="#FCDFD9"/>
  <text x="121" y="74" font-family="-apple-system, sans-serif" font-size="10" font-weight="bold" fill="#D82C0D" text-anchor="middle">10%</text>
  <g transform="translate(110, 10)">
    <rect x="0" y="0" width="20" height="20" rx="3" fill="#008060"/>
    <rect x="3" y="5" width="14" height="12" rx="1.5" fill="#FFFFFF"/>
    <line x1="6" y1="2" x2="6" y2="4" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="14" y1="2" x2="14" y2="4" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="8" cy="9" r="1.5" fill="#D82C0D"/>
    <circle cx="12" cy="9" r="1.5" fill="#008060"/>
    <circle cx="8" cy="13" r="1.5" fill="#008060"/>
    <circle cx="12" cy="13" r="1.5" fill="#8C9196"/>
  </g>
</svg>`;

const themeSvg = `<svg viewBox="0 0 160 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <rect width="160" height="120" rx="8" fill="#F4F6F8"/>
  <circle cx="40" cy="35" r="24" fill="#EAF1F8" opacity="0.6"/>
  <circle cx="130" cy="95" r="20" fill="#EAF1F8" opacity="0.4"/>
  <rect x="20" y="20" width="120" height="80" rx="6" fill="#FFFFFF" stroke="#E1E3E5" stroke-width="1.5"/>
  <path d="M20 26 L140 26" stroke="#E1E3E5" stroke-width="1"/>
  <circle cx="26" cy="23" r="2" fill="#E1E3E5"/>
  <circle cx="31" cy="23" r="2" fill="#E1E3E5"/>
  <circle cx="36" cy="23" r="2" fill="#E1E3E5"/>
  <rect x="30" y="36" width="36" height="42" rx="3" fill="#F1F2F4"/>
  <path d="M38 52 L44 58 L50 50 L60 62 M34 70 L62 70" stroke="#C9CCCF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="74" y1="40" x2="115" y2="40" stroke="#8C9196" stroke-width="3" stroke-linecap="round"/>
  <line x1="74" y1="48" x2="95" y2="48" stroke="#C9CCCF" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="74" y="58" width="58" height="20" rx="3" fill="#FFF5E5" stroke="#FFC485" stroke-width="1"/>
  <circle cx="82" cy="68" r="4.5" fill="none" stroke="#E06C00" stroke-width="1"/>
  <line x1="82" y1="68" x2="82" y2="66" stroke="#E06C00" stroke-width="1" stroke-linecap="round"/>
  <line x1="82" y1="68" x2="85" y2="68" stroke="#E06C00" stroke-width="1" stroke-linecap="round"/>
  <line x1="91" y1="68" x2="124" y2="68" stroke="#E06C00" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="103" cy="68" r="8" fill="#008060" opacity="0.2"/>
  <circle cx="103" cy="68" r="4" fill="#008060"/>
  <path d="M125 35 L129 35 M127 33 L127 37" stroke="#008060" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const customizeSvg = `<svg viewBox="0 0 160 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <rect width="160" height="120" rx="8" fill="#F4F6F8"/>
  <circle cx="120" cy="85" r="24" fill="#FCE9E9" opacity="0.6"/>
  <circle cx="40" cy="35" r="18" fill="#EAF1F8" opacity="0.5"/>
  <rect x="20" y="25" width="45" height="70" rx="4" fill="#FFFFFF" stroke="#E1E3E5" stroke-width="1.5"/>
  <line x1="28" y1="34" x2="48" y2="34" stroke="#8C9196" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="28" cy="46" r="4" fill="#008060"/>
  <line x1="36" y1="46" x2="56" y2="46" stroke="#C9CCCF" stroke-width="2" stroke-linecap="round"/>
  <line x1="28" y1="58" x2="58" y2="58" stroke="#E1E3E5" stroke-width="2" stroke-linecap="round"/>
  <circle cx="48" cy="58" r="3.5" fill="#202223"/>
  <circle cx="28" cy="70" r="4" fill="#D82C0D"/>
  <line x1="36" y1="70" x2="56" y2="70" stroke="#C9CCCF" stroke-width="2" stroke-linecap="round"/>
  <rect x="75" y="25" width="65" height="70" rx="4" fill="#FFFFFF" stroke="#E1E3E5" stroke-width="1.5"/>
  <line x1="83" y1="36" x2="110" y2="36" stroke="#C9CCCF" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="83" y="46" width="49" height="24" rx="3" fill="#D82C0D"/>
  <circle cx="91" cy="58" r="3" fill="#FFFFFF" opacity="0.8"/>
  <line x1="99" y1="58" x2="124" y2="58" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M52 46 C60 46 64 48 78 50" stroke="#008060" stroke-width="1" stroke-dasharray="2,2" stroke-linecap="round" fill="none"/>
  <g transform="translate(68, 44) rotate(-30)">
    <path d="M0 12 L4 16 L12 8 L8 4 Z" fill="#202223"/>
    <path d="M12 8 L14 4 L10 2 L8 4 Z" fill="#FFC485"/>
    <path d="M14 4 C15 3 17 3 18 4 C19 5 19 7 18 8 L14 8 Z" fill="#008060"/>
  </g>
</svg>`;

const campaignIllustrationUrl = `data:image/svg+xml;utf8,${encodeURIComponent(campaignSvg)}`;
const themeIllustrationUrl = `data:image/svg+xml;utf8,${encodeURIComponent(themeSvg)}`;
const customizeIllustrationUrl = `data:image/svg+xml;utf8,${encodeURIComponent(customizeSvg)}`;

export default function Dashboard() {
  const { shopDomain, apiKey, themeSettings, stats, upcomingJobs, recentlyCompleted, activeCampaignsList } = useLoaderData() as any;
  const navigate = useNavigate();
  const submit = useSubmit();

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

  const setupItems = [
    {
      id: "campaign",
      title: "Create your first discount campaign",
      description: "Automate your pricing strategy. Set up a campaign with multi-stage discounts to automatically change product prices over time.",
      image: {
        url: campaignIllustrationUrl,
        alt: "Illustration showing a multi-stage discount campaign progression",
      },
      complete: themeSettings?.setupCampaignCreated ?? false,
      primaryButton: {
        content: "Create Campaign",
        props: {
          onClick: () => navigate("/app/campaigns/new"),
        },
      },
    },
    {
      id: "theme",
      title: "Add the Discount Timer to your theme",
      description: "Enable the Discount Timer widget on your product pages. This shows customers when the current discount stage ends, driving urgency.",
      image: {
        url: themeIllustrationUrl,
        alt: "Illustration showing a timer widget added on a product page preview",
      },
      complete: themeSettings?.setupThemeAdded ?? false,
      primaryButton: {
        content: "Open Theme Editor",
        props: {
          href: `https://${shopDomain}/admin/themes/current/editor?template=product&addAppBlockId=${apiKey}/discount-timer&target=sectionId:main`,
          target: "_blank",
          onClick: async () => {
            const formData = new FormData();
            formData.append("actionType", "updateSetupStep");
            formData.append("stepId", "theme");
            formData.append("complete", "true");
            submit(formData, { method: "POST" });
          },
        },
      },
    },
    {
      id: "customize",
      title: "Customize widget settings",
      description: "Personalize the colors, font sizes, margins, and texts of your discount widget to match your store's branding.",
      image: {
        url: customizeIllustrationUrl,
        alt: "Illustration showing a settings controls dashboard and a customized widget preview",
      },
      complete: themeSettings?.setupThemeCustomized ?? false,
      primaryButton: {
        content: "Configure Theme Settings",
        props: {
          onClick: () => {
            const formData = new FormData();
            formData.append("actionType", "updateSetupStep");
            formData.append("stepId", "customize");
            formData.append("complete", "true");
            formData.append("redirectTo", "/app/theme-settings");
            submit(formData, { method: "POST" });
          },
        },
      },
    },
  ];

  const onStepComplete = async (id: string) => {
    const item = setupItems.find((i) => i.id === id);
    if (!item) return;
    const nextCompleteState = !item.complete;

    const formData = new FormData();
    formData.append("actionType", "updateSetupStep");
    formData.append("stepId", id);
    formData.append("complete", nextCompleteState ? "true" : "false");
    submit(formData, { method: "POST" });
  };

  const onDismiss = () => {
    const formData = new FormData();
    formData.append("actionType", "dismissSetupGuide");
    formData.append("dismissed", "true");
    submit(formData, { method: "POST" });
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

      {/* ── Onboarding Setup Guide ── */}
      {themeSettings && !themeSettings.setupGuideDismissed && (
        <s-section>
          <SetupGuide
            onDismiss={onDismiss}
            onStepComplete={onStepComplete}
            items={setupItems}
          />
        </s-section>
      )}

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
