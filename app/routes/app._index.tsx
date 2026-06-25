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

  const recentlyCompleted = await prisma.campaign.findMany({
    where: { shopId: shop.id, status: "COMPLETED" },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  return {
    stats: { totalCampaigns, activeCampaigns, scheduledCampaigns, completedCampaigns, productsAffected, priceUpdatesToday },
    upcomingJobs,
    recentlyCompleted,
  };
};

export default function Dashboard() {
  const { stats, upcomingJobs, recentlyCompleted } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <s-page
      title="Dashboard"
      subtitle="Smart Scheduled Discount Manager Overview"
    >
      <s-button slot="primary-action" variant="primary" onClick={() => navigate("/app/campaigns/new")}>
        Create campaign
      </s-button>

      {/* KPI Stats Row */}
      <s-stack direction="inline" gap="base">
        <s-grid>
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" justify-content="space-between" align-items="center">
              <s-text tone="subdued">Active Campaigns</s-text>
              <s-icon name="PlayCircle" tone="success" />
            </s-stack>
            <s-text variant="headingLg">{stats.activeCampaigns}</s-text>
            <s-text tone="subdued" variant="bodySm">Currently running</s-text>
          </s-stack>
        </s-grid>

        <s-grid>
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" justify-content="space-between" align-items="center">
              <s-text tone="subdued">Scheduled</s-text>
              <s-icon name="CalendarIcon" tone="info" />
            </s-stack>
            <s-text variant="headingLg">{stats.scheduledCampaigns}</s-text>
            <s-text tone="subdued" variant="bodySm">Awaiting start time</s-text>
          </s-stack>
        </s-grid>

        <s-grid>
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" justify-content="space-between" align-items="center">
              <s-text tone="subdued">Products Targeted</s-text>
              <s-icon name="ProductIcon" />
            </s-stack>
            <s-text variant="headingLg">{stats.productsAffected}</s-text>
            <s-text tone="subdued" variant="bodySm">Unique products targeted</s-text>
          </s-stack>
        </s-grid>

        <s-grid>
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" justify-content="space-between" align-items="center">
              <s-text tone="subdued">Updates Today</s-text>
              <s-icon name="ClockIcon" tone="caution" />
            </s-stack>
            <s-text variant="headingLg">{stats.priceUpdatesToday}</s-text>
            <s-text tone="subdued" variant="bodySm">Successful price updates today</s-text>
          </s-stack>
        </s-grid>
      </s-stack>

      {/* Upcoming & Completed */}
      <s-stack direction="inline" gap="base" align-items="start">
        {/* Upcoming Stage Changes */}
        <s-grid>
          <s-stack direction="block" gap="base">
            <s-heading>Upcoming Stage Changes (Next 24 Hours)</s-heading>
            {upcomingJobs.length === 0 ? (
              <s-text tone="subdued">No stage changes scheduled for the next 24 hours.</s-text>
            ) : (
              <s-stack direction="block" gap="small">
                {upcomingJobs.map((job) => (
                  <s-stack key={job.id} direction="inline" justify-content="space-between" align-items="center">
                    <s-text>Stage change scheduled</s-text>
                    <s-badge tone="info">
                      {new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </s-badge>
                  </s-stack>
                ))}
              </s-stack>
            )}
          </s-stack>
        </s-grid>

        {/* Recently Completed */}
        <s-grid>
          <s-stack direction="block" gap="base">
            <s-heading>Recently Completed Campaigns</s-heading>
            {recentlyCompleted.length === 0 ? (
              <s-text tone="subdued">No campaigns completed yet.</s-text>
            ) : (
              <s-stack direction="block" gap="small">
                {recentlyCompleted.map((campaign) => (
                  <s-stack key={campaign.id} direction="inline" justify-content="space-between" align-items="center">
                    <s-stack direction="block" gap="none">
                      <s-text font-weight="semibold">{campaign.name}</s-text>
                      <s-text tone="subdued" variant="bodySm">
                        Ended {new Date(campaign.endDate).toLocaleDateString()}
                      </s-text>
                    </s-stack>
                    <s-badge tone="success">Completed</s-badge>
                  </s-stack>
                ))}
              </s-stack>
            )}
          </s-stack>
        </s-grid>
      </s-stack>
    </s-page>
  );
}
