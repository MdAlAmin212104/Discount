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
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.DRAFT } });
      await prisma.campaignStage.updateMany({ where: { campaignId: campaign.id }, data: { status: StageStatus.PENDING } });
      await prisma.schedulerJob.deleteMany({ where: { stageId: { in: campaign.stages.map((s) => s.id) } } });
      await prisma.activityLog.create({ data: { shopId: shop.id, campaignId: campaign.id, event: LogEvent.CAMPAIGN_UPDATED, message: `Campaign "${campaign.name}" paused (moved to draft).` } });
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
  const toneMap: Record<string, "info" | "auto" | "neutral" | "success" | "caution" | "warning" | "critical"> = {
    ACTIVE: "success",
    SCHEDULED: "info",
    DRAFT: "neutral",
    COMPLETED: "success",
    PAUSED: "neutral",
  };
  const label = status === "PAUSED" ? "DRAFT" : status;
  return <s-badge tone={toneMap[status] ?? "neutral"}>{label}</s-badge>;
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
    <s-page heading={campaign.name}>
      <s-link slot="breadcrumb-actions" onClick={() => navigate("/app/campaigns")}>Campaigns</s-link>

      {(campaign.status === "ACTIVE" || campaign.status === "SCHEDULED") && (
        <s-button icon="pause-circle" slot="primary-action" variant="primary" onClick={() => submit({ intent: "PAUSE" }, { method: "POST" })}>
          Pause Campaign
        </s-button>
      )}
      {campaign.status === "DRAFT" && (
        <s-button icon="play-circle" slot="primary-action" variant="primary" onClick={() => submit({ intent: "RESUME" }, { method: "POST" })}>
          Resume Campaign
        </s-button>
      )}
      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() => navigate(`/app/campaigns/new?id=${campaign.id}`)}
        icon="edit"
      >
        Edit Campaign
      </s-button>
      <s-button
        slot="secondary-actions"
        variant="secondary"
        tone="critical"
        icon="delete"
        commandFor="delete-modal"
        command="--show"
      >
        Delete
      </s-button>

      {/* Tab Bar */}
      <div style={{ borderBottom: "1px solid var(--p-border-subdued)", marginBottom: "16px", marginTop: "8px", paddingBottom: "8px" }}>
        <s-stack direction="inline" gap="small">
          {tabs.map((tab, i) => (
            <s-button key={tab} variant={activeTab === i ? "primary" : "tertiary"} onClick={() => setActiveTab(i)}>
              {tab}
            </s-button>
          ))}
          <StatusBadge status={campaign.status} />
        </s-stack>
      </div>

      {/* TAB 1: Details */}
      {activeTab === 0 && (
        <s-stack direction="block" gap="base">
          <s-card heading="Campaign Info">
            <s-box padding="base">
              <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
                <s-stack direction="block" gap="none">
                  <s-text tone="neutral">Type</s-text>
                  <s-text><strong>{campaign.discountType === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}</strong></s-text>
                </s-stack>
                <s-stack direction="block" gap="none">
                  <s-text tone="neutral">Timezone</s-text>
                  <s-text><strong>{campaign.timezone}</strong></s-text>
                </s-stack>
                <s-stack direction="block" gap="none">
                  <s-text tone="neutral">Start Date</s-text>
                  <s-text><strong>{new Date(campaign.startDate).toLocaleString()}</strong></s-text>
                </s-stack>
                <s-stack direction="block" gap="none">
                  <s-text tone="neutral">End Date</s-text>
                  <s-text><strong>{new Date(campaign.endDate).toLocaleString()}</strong></s-text>
                </s-stack>
              </s-grid>

              {campaign.notes && (
                <s-box paddingBlockStart="base">
                  <s-divider />
                  <s-box paddingBlockStart="base">
                    <s-stack direction="block" gap="none">
                      <s-text tone="neutral">Notes</s-text>
                      <s-text>{campaign.notes}</s-text>
                    </s-stack>
                  </s-box>
                </s-box>
              )}
            </s-box>
          </s-card>

          <s-card heading="Campaign Stages">
            <s-box padding="base">
              <s-table>
                <s-table-header-row>
                  <s-table-header format="numeric">#</s-table-header>
                  <s-table-header listSlot="primary">Label</s-table-header>
                  <s-table-header>Discount</s-table-header>
                  <s-table-header>Start</s-table-header>
                  <s-table-header>End</s-table-header>
                  <s-table-header listSlot="secondary">Status</s-table-header>
                </s-table-header-row>

                <s-table-body>
                  {campaign.stages.map((stage) => {
                    let stageLabelNode = <s-text>{stage.label || "—"}</s-text>;
                    if (stage.label) {
                      try {
                        const parsed = JSON.parse(stage.label);
                        if (parsed && typeof parsed === "object" && parsed.isCirclePhase) {
                          stageLabelNode = (
                            <s-stack direction="block" gap="none">
                              <s-text><strong>{parsed.phaseTitle || parsed.label}</strong></s-text>
                              <s-text tone="neutral">
                                Badge Label: "{parsed.label}"
                                {parsed.discountCode ? ` · Code: ${parsed.discountCode}` : ""}
                                {parsed.visible === false ? " · Hidden" : " · Visible"}
                                {parsed.autoApply ? " · Auto-applied" : ""}
                              </s-text>
                            </s-stack>
                          );
                        }
                      } catch (e) {}
                    }

                    return (
                      <s-table-row key={stage.id}>
                        <s-table-cell>{stage.stageNumber}</s-table-cell>
                        <s-table-cell>{stageLabelNode}</s-table-cell>
                        <s-table-cell>
                          <s-text>{stage.discountValue}{campaign.discountType === "PERCENTAGE" ? "%" : "$"}</s-text>
                        </s-table-cell>
                        <s-table-cell>{new Date(stage.startDate).toLocaleDateString()}</s-table-cell>
                        <s-table-cell>{new Date(stage.endDate).toLocaleDateString()}</s-table-cell>
                        <s-table-cell>
                          <s-badge tone={stage.status === "ACTIVE" ? "success" : stage.status === "COMPLETED" ? "success" : "info"}>
                            {stage.status}
                          </s-badge>
                        </s-table-cell>
                      </s-table-row>
                    );
                  })}
                </s-table-body>
              </s-table>
            </s-box>
          </s-card>
        </s-stack>
      )}

      {/* TAB 2: Conflicts */}
      {activeTab === 1 && (
        <s-card heading="Conflict Detection Log">
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-text tone="neutral">
                When multiple campaigns target the same variants, the system resolves by applying the best price.
              </s-text>
              {conflicts.length === 0 ? (
                <s-banner tone="success">No price conflicts detected for this campaign.</s-banner>
              ) : (
                <s-table>
                  <s-table-header-row>
                    <s-table-header listSlot="primary">Date/Time</s-table-header>
                    <s-table-header>Variant ID</s-table-header>
                    <s-table-header listSlot="secondary">Message</s-table-header>
                  </s-table-header-row>

                  <s-table-body>
                    {conflicts.map((log) => (
                      <s-table-row key={log.id}>
                        <s-table-cell>{new Date(log.createdAt).toLocaleString()}</s-table-cell>
                        <s-table-cell>
                          <s-badge>{((log.metadata as any)?.variantId ?? "").split("/").pop()}</s-badge>
                        </s-table-cell>
                        <s-table-cell>
                          <s-text>{log.message}</s-text>
                        </s-table-cell>
                      </s-table-row>
                    ))}
                  </s-table-body>
                </s-table>
              )}
            </s-stack>
          </s-box>
        </s-card>
      )}

      {/* TAB 3: Logs */}
      {activeTab === 2 && (
        <s-card heading="Activity Logs">
          <s-box padding="base">
            {logs.length === 0 ? (
              <s-text tone="neutral">No activity logs yet.</s-text>
            ) : (
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Date/Time</s-table-header>
                  <s-table-header>Event</s-table-header>
                  <s-table-header listSlot="secondary">Message</s-table-header>
                </s-table-header-row>

                <s-table-body>
                  {logs.map((log) => {
                    const toneMap: Record<string, "info" | "auto" | "neutral" | "success" | "caution" | "warning" | "critical"> = {
                      PRICE_UPDATED: "success",
                      PRICE_RESTORED: "success",
                      SCHEDULER_ERROR: "critical",
                      STAGE_STARTED: "info",
                      STAGE_COMPLETED: "info"
                    };
                    return (
                      <s-table-row key={log.id}>
                        <s-table-cell>{new Date(log.createdAt).toLocaleString()}</s-table-cell>
                        <s-table-cell>
                          <s-badge tone={toneMap[log.event] ?? "neutral"}>{log.event}</s-badge>
                        </s-table-cell>
                        <s-table-cell>
                          <s-text>{log.message}</s-text>
                        </s-table-cell>
                      </s-table-row>
                    );
                  })}
                </s-table-body>
              </s-table>
            )}
          </s-box>
        </s-card>
      )}
      {/* Delete Confirmation Modal */}
      <s-modal
        id="delete-modal"
        heading="Delete campaign?"
        size="small"
      >
        <s-box padding="base">
          <s-stack direction="block" gap="base">
            <s-text>
              Are you sure you want to delete the campaign <strong>{campaign.name}</strong>? This action cannot be undone and baseline prices will be restored.
            </s-text>
          </s-stack>
        </s-box>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor="delete-modal"
          command="--hide"
          onClick={() => submit({ intent: "DELETE" }, { method: "POST" })}
        >
          Delete campaign
        </s-button>
        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="delete-modal"
          command="--hide"
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}
