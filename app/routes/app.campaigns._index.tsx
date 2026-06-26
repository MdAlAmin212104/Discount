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
  const toneMap: Record<string, "info" | "auto" | "neutral" | "success" | "caution" | "warning" | "critical"> = {
    ACTIVE: "success",
    SCHEDULED: "info",
    DRAFT: "neutral",
    COMPLETED: "success",
    PAUSED: "caution",
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
    <s-page heading="Campaigns">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/campaigns/new")}
      >
        New campaign
      </s-button>

      {/* Tab Bar */}
      <div style={{ borderBottom: "1px solid var(--p-border-subdued)", marginBottom: "16px", paddingBottom: "8px" }}>
        <s-stack direction="inline" gap="small">
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
      </div>

      <s-grid padding="none">
        {filtered.length === 0 ? (
          <s-stack direction="block" gap="base" align-items="center" padding="large-200">
            <div style={{ color: "var(--p-color-text-secondary, #616161)", fontSize: "14px" }}>No campaigns found for the selected view.</div>
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
                    <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--p-color-text-secondary, #616161)" }}>{h}</span>
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
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>{campaign.name}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: "14px" }}>{campaign.discountType === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: "14px" }}>{campaign.stages.length} stages</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: "14px" }}>
                      {new Date(campaign.startDate).toLocaleDateString()} -{" "}
                      {new Date(campaign.endDate).toLocaleDateString()}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <s-button
                      variant="secondary"
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
