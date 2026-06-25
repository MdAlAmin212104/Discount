import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import type { CampaignStatus } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const campaigns = await prisma.campaign.findMany({
    where: { shopId: shop.id },
    include: { stages: true },
    orderBy: { createdAt: "desc" },
  });

  return { campaigns };
};

const STATUS_TABS = ["ALL", "ACTIVE", "SCHEDULED", "DRAFT", "COMPLETED"];

function StatusBadge({ status }: { status: CampaignStatus }) {
  const toneMap: Record<string, string> = {
    ACTIVE: "success",
    SCHEDULED: "info",
    DRAFT: "neutral",
    COMPLETED: "success",
    PAUSED: "attention",
  };
  return <s-badge tone={toneMap[status] ?? "neutral"}>{status}</s-badge>;
}

export default function CampaignsList() {
  const { campaigns } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);

  const filtered = campaigns.filter((c) =>
    activeTab === 0 ? true : c.status === STATUS_TABS[activeTab]
  );

  return (
    <s-page title="Campaigns">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/campaigns/new")}
      >
        New campaign
      </s-button>

      {/* Tab Bar */}
      <s-stack direction="inline" gap="small" style={{ borderBottom: "1px solid var(--p-border-subdued)", marginBottom: "16px" }}>
        {STATUS_TABS.map((tab, i) => (
          <s-button
            key={tab}
            variant={activeTab === i ? "primary" : "tertiary"}
            onClick={() => setActiveTab(i)}
          >
            {tab.charAt(0) + tab.slice(1).toLowerCase()}
          </s-button>
        ))}
      </s-stack>

      <s-grid padding="none">
        {filtered.length === 0 ? (
          <s-stack direction="block" gap="base" align-items="center" padding="large-200">
            <s-text tone="subdued">No campaigns found for the selected view.</s-text>
            <s-button variant="primary" onClick={() => navigate("/app/campaigns/new")}>
              Create campaign
            </s-button>
          </s-stack>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "inherit" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--p-border-subdued)", textAlign: "left" }}>
                {["Campaign Name", "Status", "Type", "Stages", "Date Range", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "12px 16px" }}>
                    <s-text font-weight="semibold" variant="bodySm">{h}</s-text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((campaign) => (
                <tr
                  key={campaign.id}
                  style={{ borderBottom: "1px solid var(--p-border-subdued)" }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <s-text font-weight="semibold">{campaign.name}</s-text>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <s-text>{campaign.discountType === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}</s-text>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <s-text>{campaign.stages.length} stages</s-text>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <s-text>
                      {new Date(campaign.startDate).toLocaleDateString()} -{" "}
                      {new Date(campaign.endDate).toLocaleDateString()}
                    </s-text>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <s-button
                      variant="secondary"
                      icon="EditIcon"
                      onClick={() => navigate(`/app/campaigns/${campaign.id}`)}
                    >
                      Edit
                    </s-button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-grid>
    </s-page>
  );
}
