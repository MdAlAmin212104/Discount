import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate, unauthenticated } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import { CampaignStatus, StageStatus, LogEvent, JobStatus } from "@prisma/client";
import { updateVariantPriceWithRetry } from "../services/shopify-price.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: { stages: { orderBy: { stageNumber: "asc" } }, products: true },
  });

  if (!campaign) throw new Response("Campaign Not Found", { status: 404 });

  const conflicts = await prisma.activityLog.findMany({
    where: { shopId: shop.id, campaignId: campaign.id, event: LogEvent.CONFLICT_DETECTED },
    orderBy: { createdAt: "desc" },
  });

  const logs = await prisma.activityLog.findMany({
    where: { shopId: shop.id, campaignId: campaign.id, event: { not: LogEvent.CONFLICT_DETECTED } },
    orderBy: { createdAt: "desc" },
  });

  return { campaign, conflicts, logs };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const formData = await request.formData();
  const intent = formData.get("intent");
  const { admin } = await unauthenticated.admin(shop.domain);

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: { stages: true, products: true },
  });

  if (!campaign) return { error: "Campaign not found" };

  const restoreVariants = async () => {
    const snapshots = await prisma.variantPriceSnapshot.findMany({ where: { shopId: shop.id, campaignId: campaign.id } });
    for (const snap of snapshots) {
      const others = await prisma.variantPriceSnapshot.findMany({
        where: { shopId: shop.id, variantId: snap.variantId, campaignId: { not: campaign.id }, campaign: { status: CampaignStatus.ACTIVE } },
        include: { campaign: { include: { stages: { where: { status: StageStatus.ACTIVE } } } } },
      });
      if (others.length > 0) {
        const prices = others.map((o) => {
          const s = o.campaign.stages[0];
          let p = snap.originalPrice;
          if (o.campaign.discountType === "PERCENTAGE") p = snap.originalPrice * (1 - (s?.discountValue ?? 0) / 100);
          else p = Math.max(0, snap.originalPrice - (s?.discountValue ?? 0));
          return p;
        });
        await updateVariantPriceWithRetry(admin, snap.variantId, Math.min(...prices), snap.originalPrice);
      } else {
        await updateVariantPriceWithRetry(admin, snap.variantId, snap.originalPrice, null);
      }
    }
  };

  if (intent === "DELETE") {
    try {
      await restoreVariants();
      await prisma.schedulerJob.deleteMany({ where: { stageId: { in: campaign.stages.map((s) => s.id) } } });
      await prisma.variantPriceSnapshot.deleteMany({ where: { campaignId: campaign.id } });
      await prisma.campaign.delete({ where: { id: campaign.id } });
      return { success: true, redirect: "/app/campaigns" };
    } catch (e: any) { return { error: e.message }; }
  }

  if (intent === "PAUSE") {
    try {
      await restoreVariants();
      await prisma.variantPriceSnapshot.deleteMany({ where: { campaignId: campaign.id } });
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.PAUSED } });
      await prisma.campaignStage.updateMany({ where: { campaignId: campaign.id }, data: { status: StageStatus.PENDING } });
      await prisma.schedulerJob.deleteMany({ where: { stageId: { in: campaign.stages.map((s) => s.id) } } });
      await prisma.activityLog.create({ data: { shopId: shop.id, campaignId: campaign.id, event: LogEvent.CAMPAIGN_UPDATED, message: `Campaign "${campaign.name}" paused.` } });
      return { success: true };
    } catch (e: any) { return { error: e.message }; }
  }

  if (intent === "RESUME") {
    try {
      const now = new Date();
      if (campaign.endDate <= now) {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.COMPLETED } });
        return { error: "Campaign end date is in the past." };
      }
      for (const stage of campaign.stages) {
        if (stage.endDate > now) {
          await prisma.schedulerJob.upsert({
            where: { stageId: stage.id },
            update: { scheduledAt: stage.startDate <= now ? now : stage.startDate, status: JobStatus.PENDING, attempts: 0 },
            create: { shopId: shop.id, stageId: stage.id, scheduledAt: stage.startDate <= now ? now : stage.startDate, status: JobStatus.PENDING },
          });
        }
      }
      const nextStatus = campaign.startDate <= now ? CampaignStatus.ACTIVE : CampaignStatus.SCHEDULED;
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: nextStatus } });
      await prisma.activityLog.create({ data: { shopId: shop.id, campaignId: campaign.id, event: LogEvent.CAMPAIGN_UPDATED, message: `Campaign "${campaign.name}" resumed.` } });
      return { success: true };
    } catch (e: any) { return { error: e.message }; }
  }

  return { error: "Unknown intent" };
};

function StatusBadge({ status }: { status: string }) {
  const toneMap: Record<string, string> = { ACTIVE: "success", SCHEDULED: "info", DRAFT: "neutral", COMPLETED: "success", PAUSED: "attention" };
  return <s-badge tone={toneMap[status] ?? "neutral"}>{status}</s-badge>;
}

export default function CampaignDetail() {
  const { campaign, conflicts, logs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (actionData?.success) {
      if ((actionData as any).redirect) navigate((actionData as any).redirect);
      else shopify.toast.show("Campaign updated");
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData]);

  const tabs = ["Details & Stages", `Conflicts (${conflicts.length})`, "Activity Logs"];

  return (
    <s-page title={campaign.name}>
      <s-button slot="back-action" variant="tertiary" onClick={() => navigate("/app/campaigns")}>Campaigns</s-button>

      {(campaign.status === "ACTIVE" || campaign.status === "SCHEDULED") && (
        <s-button slot="primary-action" variant="primary" onClick={() => submit({ intent: "PAUSE" }, { method: "POST" })}>
          Pause Campaign
        </s-button>
      )}
      {(campaign.status === "PAUSED" || campaign.status === "DRAFT") && (
        <s-button slot="primary-action" variant="primary" onClick={() => submit({ intent: "RESUME" }, { method: "POST" })}>
          Resume Campaign
        </s-button>
      )}
      <s-button
        slot="secondary-action"
        tone="critical"
        onClick={() => {
          if (confirm("Delete this campaign? Prices will be restored.")) submit({ intent: "DELETE" }, { method: "POST" });
        }}
      >
        Delete
      </s-button>

      {/* Title Badge */}
      <s-stack direction="inline" gap="small" align-items="center">
        <StatusBadge status={campaign.status} />
      </s-stack>

      {/* Tab Bar */}
      <s-stack direction="inline" gap="small" style={{ borderBottom: "1px solid var(--p-border-subdued)", marginBottom: "16px", marginTop: "16px" }}>
        {tabs.map((tab, i) => (
          <s-button key={tab} variant={activeTab === i ? "primary" : "tertiary"} onClick={() => setActiveTab(i)}>
            {tab}
          </s-button>
        ))}
      </s-stack>

      {/* TAB 1: Details */}
      {activeTab === 0 && (
        <s-stack direction="block" gap="large">
          <s-grid>
            <s-stack direction="block" gap="base">
              <s-heading>Campaign Info</s-heading>
              <s-stack direction="inline" gap="large">
                <s-stack direction="block" gap="none">
                  <s-text font-weight="semibold">Type</s-text>
                  <s-text>{campaign.discountType === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}</s-text>
                </s-stack>
                <s-stack direction="block" gap="none">
                  <s-text font-weight="semibold">Timezone</s-text>
                  <s-text>{campaign.timezone}</s-text>
                </s-stack>
                <s-stack direction="block" gap="none">
                  <s-text font-weight="semibold">Start</s-text>
                  <s-text>{new Date(campaign.startDate).toLocaleString()}</s-text>
                </s-stack>
                <s-stack direction="block" gap="none">
                  <s-text font-weight="semibold">End</s-text>
                  <s-text>{new Date(campaign.endDate).toLocaleString()}</s-text>
                </s-stack>
              </s-stack>
              {campaign.notes && (
                <s-stack direction="block" gap="none">
                  <s-text font-weight="semibold">Notes</s-text>
                  <s-text tone="subdued">{campaign.notes}</s-text>
                </s-stack>
              )}
            </s-stack>
          </s-grid>

          <s-grid>
            <s-stack direction="block" gap="base">
              <s-heading>Campaign Stages</s-heading>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--p-border-subdued)" }}>
                    {["#", "Label", "Discount", "Start", "End", "Status"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>
                        <s-text font-weight="semibold" variant="bodySm">{h}</s-text>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaign.stages.map((stage) => (
                    <tr key={stage.id} style={{ borderBottom: "1px solid var(--p-border-subdued)" }}>
                      <td style={{ padding: "8px 12px" }}><s-text>{stage.stageNumber}</s-text></td>
                      <td style={{ padding: "8px 12px" }}><s-text>{stage.label || "—"}</s-text></td>
                      <td style={{ padding: "8px 12px" }}>
                        <s-text>{stage.discountValue}{campaign.discountType === "PERCENTAGE" ? "%" : "$"}</s-text>
                      </td>
                      <td style={{ padding: "8px 12px" }}><s-text>{new Date(stage.startDate).toLocaleDateString()}</s-text></td>
                      <td style={{ padding: "8px 12px" }}><s-text>{new Date(stage.endDate).toLocaleDateString()}</s-text></td>
                      <td style={{ padding: "8px 12px" }}>
                        <s-badge tone={stage.status === "ACTIVE" ? "success" : stage.status === "COMPLETED" ? "success" : "info"}>
                          {stage.status}
                        </s-badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </s-stack>
          </s-grid>
        </s-stack>
      )}

      {/* TAB 2: Conflicts */}
      {activeTab === 1 && (
        <s-grid>
          <s-stack direction="block" gap="base">
            <s-heading>Conflict Detection Log</s-heading>
            <s-text tone="subdued">
              When multiple campaigns target the same variants, the system resolves by applying the best price.
            </s-text>
            {conflicts.length === 0 ? (
              <s-banner tone="success">No price conflicts detected for this campaign.</s-banner>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--p-border-subdued)" }}>
                    {["Date/Time", "Variant ID", "Message"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>
                        <s-text font-weight="semibold" variant="bodySm">{h}</s-text>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conflicts.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--p-border-subdued)" }}>
                      <td style={{ padding: "8px 12px" }}><s-text>{new Date(log.createdAt).toLocaleString()}</s-text></td>
                      <td style={{ padding: "8px 12px" }}>
                        <s-badge>{((log.metadata as any)?.variantId ?? "").split("/").pop()}</s-badge>
                      </td>
                      <td style={{ padding: "8px 12px" }}><s-text>{log.message}</s-text></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </s-stack>
        </s-grid>
      )}

      {/* TAB 3: Logs */}
      {activeTab === 2 && (
        <s-grid>
          <s-stack direction="block" gap="base">
            <s-heading>Activity Logs</s-heading>
            {logs.length === 0 ? (
              <s-text tone="subdued">No activity logs yet.</s-text>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--p-border-subdued)" }}>
                    {["Date/Time", "Event", "Message"].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>
                        <s-text font-weight="semibold" variant="bodySm">{h}</s-text>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const toneMap: Record<string, string> = { PRICE_UPDATED: "success", PRICE_RESTORED: "success", SCHEDULER_ERROR: "critical", STAGE_STARTED: "info", STAGE_COMPLETED: "info" };
                    return (
                      <tr key={log.id} style={{ borderBottom: "1px solid var(--p-border-subdued)" }}>
                        <td style={{ padding: "8px 12px" }}><s-text>{new Date(log.createdAt).toLocaleString()}</s-text></td>
                        <td style={{ padding: "8px 12px" }}>
                          <s-badge tone={toneMap[log.event] ?? "neutral"}>{log.event}</s-badge>
                        </td>
                        <td style={{ padding: "8px 12px" }}><s-text>{log.message}</s-text></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </s-stack>
        </s-grid>
      )}
    </s-page>
  );
}
