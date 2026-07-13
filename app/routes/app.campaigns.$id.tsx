import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate, unauthenticated } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import { CampaignStatus, StageStatus, LogEvent, JobStatus } from "@prisma/client";
import { updateVariantPriceWithRetry } from "../services/shopify-price.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
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

  // Resolve campaign's targeted products via Shopify GraphQL API
  let resolvedProducts: any[] = [];
  try {
    for (const prodTarget of campaign.products) {
      if (prodTarget.targetType === "PRODUCT") {
        const ids = prodTarget.targetValue.split(",").filter(Boolean);
        if (ids.length) {
          const res = await admin.graphql(`#graphql
            query getProductsDetails($ids: [ID!]!) {
              nodes(ids: $ids) { ... on Product { id title handle featuredImage { url } tags } }
            }`, { variables: { ids } });
          const json = await res.json();
          resolvedProducts.push(...(json.data?.nodes || []).filter(Boolean));
        }
      } else if (prodTarget.targetType === "COLLECTION") {
        const ids = prodTarget.targetValue.split(",").filter(Boolean);
        if (ids.length) {
          for (const colId of ids) {
            const res = await admin.graphql(`#graphql
              query getCollectionProducts($id: ID!) {
                collection(id: $id) {
                  products(first: 100) { nodes { id title handle featuredImage { url } tags } }
                }
              }`, { variables: { id: colId } });
            const colProds = (await res.json()).data?.collection?.products?.nodes || [];
            resolvedProducts.push(...colProds);
          }
        }
      } else if (prodTarget.targetType === "TAG") {
        const tags = prodTarget.targetValue.split(",").filter(Boolean);
        for (const tagVal of tags) {
          const res = await admin.graphql(`#graphql
            query getProductsByTag($query: String!) {
              products(first: 100, query: $query) { nodes { id title handle featuredImage { url } tags } }
            }`, { variables: { query: `tag:${tagVal}` } });
          resolvedProducts.push(...((await res.json()).data?.products?.nodes || []));
        }
      }
    }
  } catch (err) {
    console.error("Error resolving targeted products:", err);
  }

  const seen = new Set();
  const deduplicatedProducts = resolvedProducts.filter((p) => {
    if (!p || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  // Resolve conflict variant details & campaign names
  const variantIds = conflicts
    .map((c) => (c.metadata as any)?.variantId)
    .filter(Boolean);
  const uniqueVariantIds = Array.from(new Set(variantIds));
  let variantDetailsMap: Record<string, any> = {};

  if (uniqueVariantIds.length > 0) {
    try {
      const res = await admin.graphql(`#graphql
        query getVariantsDetails($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              title
              price
              product {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        }
      `, { variables: { ids: uniqueVariantIds } });
      const json = await res.json();
      const nodes = json.data?.nodes || [];
      nodes.forEach((node: any) => {
        if (node) {
          variantDetailsMap[node.id] = node;
        }
      });
    } catch (err) {
      console.error("Error resolving conflict variant details:", err);
    }
  }

  const campaignIds: string[] = [];
  conflicts.forEach((c) => {
    const meta = c.metadata as any;
    if (meta?.chosenCampaignId) campaignIds.push(meta.chosenCampaignId);
    if (meta?.conflictingCampaignIds) campaignIds.push(...meta.conflictingCampaignIds);
  });
  const uniqueCampaignIds = Array.from(new Set(campaignIds));
  let campaignNamesMap: Record<string, string> = {};

  if (uniqueCampaignIds.length > 0) {
    try {
      const relatedCampaigns = await prisma.campaign.findMany({
        where: { id: { in: uniqueCampaignIds } },
        select: { id: true, name: true },
      });
      relatedCampaigns.forEach((rc) => {
        campaignNamesMap[rc.id] = rc.name;
      });
    } catch (err) {
      console.error("Error resolving related campaigns names:", err);
    }
  }

  return {
    campaign,
    conflicts,
    resolvedProducts: deduplicatedProducts,
    variantDetailsMap,
    campaignNamesMap,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const formData = await request.formData();
  const intent = formData.get("intent");

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
          else p = (s?.discountValue ?? 0);
          return p;
        });
        await updateVariantPriceWithRetry(admin, snap.variantId, Math.min(...prices), snap.originalPrice);
      } else {
        await updateVariantPriceWithRetry(admin, snap.variantId, snap.originalPrice, snap.originalComparePrice);
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
      // await prisma.activityLog.create({ data: { shopId: shop.id, campaignId: campaign.id, event: LogEvent.CAMPAIGN_UPDATED, message: `Campaign "${campaign.name}" paused (moved to draft).` } });
      return { success: true };
    } catch (e: any) { return { error: e.message }; }
  }

  if (intent === "RESUME") {
    try {
      const now = new Date();
      let currentTime = new Date(now.getTime() + 1000); // 1-second offset to prevent microsecond differences

      // 1. Sort stages by stageNumber ascending to shift them sequentially starting from now
      const sortedStages = [...campaign.stages].sort((a, b) => a.stageNumber - b.stageNumber);
      
      const shiftedStages = [];
      for (const stage of sortedStages) {
        const duration = new Date(stage.endDate).getTime() - new Date(stage.startDate).getTime();
        const newStartDate = new Date(currentTime.getTime());
        const newEndDate = new Date(currentTime.getTime() + duration);

        // Update the stage dates and reset status to PENDING in database
        const updatedStage = await prisma.campaignStage.update({
          where: { id: stage.id },
          data: {
            startDate: newStartDate,
            endDate: newEndDate,
            status: StageStatus.PENDING,
          },
        });

        shiftedStages.push(updatedStage);
        currentTime = newEndDate;
      }

      // 2. Update the campaign itself with the new start/end dates
      const campaignStartDate = shiftedStages[0].startDate;
      const campaignEndDate = shiftedStages[shiftedStages.length - 1].endDate;

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          startDate: campaignStartDate,
          endDate: campaignEndDate,
        },
      });

      // 3. Create or upsert scheduler jobs based on the new shifted dates
      for (const stage of shiftedStages) {
        if (stage.endDate > now) {
          const scheduledAt = stage.startDate <= now ? now : stage.startDate;
          await prisma.schedulerJob.upsert({
            where: { stageId: stage.id },
            update: { scheduledAt, status: JobStatus.PENDING, attempts: 0 },
            create: { shopId: shop.id, stageId: stage.id, scheduledAt, status: JobStatus.PENDING },
          });
        }
      }

      const nextStatus = campaignStartDate <= now ? CampaignStatus.ACTIVE : CampaignStatus.SCHEDULED;
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: nextStatus } });
      // await prisma.activityLog.create({ data: { shopId: shop.id, campaignId: campaign.id, event: LogEvent.CAMPAIGN_UPDATED, message: `Campaign "${campaign.name}" resumed. Dates shifted starting from now.` } });
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
  const { campaign, conflicts, resolvedProducts, variantDetailsMap, campaignNamesMap } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [activeTab, setActiveTab] = useState(0);
  const [currentProductPage, setCurrentProductPage] = useState(1);
  const [currentConflictPage, setCurrentConflictPage] = useState(1);

  // Product Pagination calculations (10 products per page)
  const productsPerPage = 10;
  const totalProductPages = Math.ceil(resolvedProducts.length / productsPerPage) || 1;
  const displayProductPage = Math.min(currentProductPage, totalProductPages);
  const paginatedProducts = resolvedProducts.slice(
    (displayProductPage - 1) * productsPerPage,
    displayProductPage * productsPerPage
  );

  // Conflict Pagination calculations (10 conflicts per page)
  const conflictsPerPage = 10;
  const totalConflictPages = Math.ceil(conflicts.length / conflictsPerPage) || 1;
  const displayConflictPage = Math.min(currentConflictPage, totalConflictPages);
  const paginatedConflicts = conflicts.slice(
    (displayConflictPage - 1) * conflictsPerPage,
    displayConflictPage * conflictsPerPage
  );


  useEffect(() => {
    if (actionData?.success) {
      if ((actionData as any).redirect) navigate((actionData as any).redirect);
      else shopify.toast.show("Campaign updated");
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData]);

  const tabs = ["Details & Stages", `Conflicts (${conflicts.length})`];

  return (
    <s-page heading={campaign.name}>
      <s-link slot="breadcrumb-actions" onClick={() => navigate("/app/campaigns")}>Campaigns</s-link>

      {/* {(campaign.status === "ACTIVE" || campaign.status === "SCHEDULED") && (
        <s-button icon="pause-circle" slot="primary-action" variant="primary" onClick={() => submit({ intent: "PAUSE" }, { method: "POST" })}>
          Pause Campaign
        </s-button>
      )}
      {campaign.status === "DRAFT" && (
        <s-button icon="play-circle" slot="primary-action" variant="primary" onClick={() => submit({ intent: "RESUME" }, { method: "POST" })}>
          Resume Campaign
        </s-button>
      )} */}
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

          <s-card heading="Targeted Products">
            <s-box padding="base">
              {resolvedProducts.length === 0 ? (
                <s-text tone="neutral">No products targeted by this campaign.</s-text>
              ) : (
                <s-stack direction="block" gap="base">
                  <s-table>
                    <s-table-header-row>
                      <s-table-header listSlot="primary">Product</s-table-header>
                      <s-table-header>Shopify ID</s-table-header>
                      <s-table-header listSlot="secondary">Tags</s-table-header>
                    </s-table-header-row>

                    <s-table-body>
                      {paginatedProducts.map((product) => (
                        <s-table-row key={product.id}>
                          <s-table-cell>
                            <s-stack direction="inline" gap="small" alignItems="center">
                              <s-clickable
                                accessibilityLabel={product.title}
                                border="base" borderRadius="base" overflow="hidden"
                                inlineSize="40px" blockSize="40px"
                              >
                                <s-image
                                  objectFit="cover"
                                  src={product.featuredImage?.url || "https://picsum.photos/id/29/80/80"}
                                />
                              </s-clickable>
                              <s-stack direction="block" gap="none">
                                <s-text><strong>{product.title}</strong></s-text>
                                {product.handle && (
                                  <s-text color="subdued">/products/{product.handle}</s-text>
                                )}
                              </s-stack>
                            </s-stack>
                          </s-table-cell>
                          <s-table-cell>
                            <s-badge>{product.id.split("/").pop()}</s-badge>
                          </s-table-cell>
                          <s-table-cell>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {product.tags && product.tags.length > 0 ? (
                                product.tags.map((tag: string) => (
                                  <s-badge key={tag} tone="info">{tag}</s-badge>
                                ))
                              ) : (
                                <s-text color="subdued">—</s-text>
                              )}
                            </div>
                          </s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>

                  {/* Pagination */}
                  {totalProductPages > 1 && (
                    <s-box paddingBlockStart="base">
                      <s-stack direction="inline" gap="small" justifyContent="center" alignItems="center">
                        <s-button
                          disabled={displayProductPage === 1 ? true : undefined}
                          onClick={(e: any) => { e.preventDefault(); if (displayProductPage > 1) setCurrentProductPage(displayProductPage - 1); }}
                        >
                          Previous
                        </s-button>
                        <s-text>Page {displayProductPage} of {totalProductPages}</s-text>
                        <s-button
                          disabled={displayProductPage === totalProductPages ? true : undefined}
                          onClick={(e: any) => { e.preventDefault(); if (displayProductPage < totalProductPages) setCurrentProductPage(displayProductPage + 1); }}
                        >
                          Next
                        </s-button>
                      </s-stack>
                    </s-box>
                  )}
                </s-stack>
              )}
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
                <>
                  <s-table>
                    <s-table-header-row>
                      <s-table-header listSlot="primary">Date/Time</s-table-header>
                      <s-table-header>Product Variant</s-table-header>
                      <s-table-header format="numeric">Baseline Price</s-table-header>
                      <s-table-header format="numeric">Applied Price</s-table-header>
                      <s-table-header>Winner</s-table-header>
                      <s-table-header listSlot="secondary">Conflicting Campaigns</s-table-header>
                    </s-table-header-row>

                    <s-table-body>
                      {paginatedConflicts.map((log) => {
                        const meta = (log.metadata as any) || {};
                        const variantId = meta.variantId || "";
                        const variantDetails = variantDetailsMap[variantId];
                        const winningCampaignName = campaignNamesMap[meta.chosenCampaignId] || meta.chosenCampaignId || "Unknown";
                        const otherCampaignNames = (meta.conflictingCampaignIds || [])
                          .map((cid: string) => campaignNamesMap[cid] || cid)
                          .filter(Boolean)
                          .join(", ");

                        const productImage = variantDetails?.product?.featuredImage?.url || "https://picsum.photos/id/29/80/80";
                        const productTitle = variantDetails?.product?.title || "Unknown Product";
                        const variantTitle = variantDetails?.title && variantDetails.title !== "Default Title" ? ` (${variantDetails.title})` : "";

                        return (
                          <s-table-row key={log.id}>
                            <s-table-cell>{new Date(log.createdAt).toLocaleString()}</s-table-cell>
                            <s-table-cell>
                              <s-stack direction="inline" gap="small" alignItems="center">
                                <s-clickable
                                  accessibilityLabel={productTitle}
                                  border="base" borderRadius="base" overflow="hidden"
                                  inlineSize="32px" blockSize="32px"
                                >
                                  <s-image objectFit="cover" src={productImage} />
                                </s-clickable>
                                <s-stack direction="block" gap="none">
                                  <s-text><strong>{productTitle}{variantTitle}</strong></s-text>
                                  <s-text color="subdued">ID: {variantId.split("/").pop()}</s-text>
                                </s-stack>
                              </s-stack>
                            </s-table-cell>
                            <s-table-cell>
                              <s-text>${(meta.originalPrice ?? 0).toFixed(2)}</s-text>
                            </s-table-cell>
                            <s-table-cell>
                              <s-text tone="success"><strong>${(meta.chosenPrice ?? 0).toFixed(2)}</strong></s-text>
                            </s-table-cell>
                            <s-table-cell>
                              <s-badge tone="success">{winningCampaignName}</s-badge>
                            </s-table-cell>
                            <s-table-cell>
                              {otherCampaignNames ? (
                                <s-text color="subdued">{otherCampaignNames}</s-text>
                              ) : (
                                <s-text color="subdued">—</s-text>
                              )}
                            </s-table-cell>
                          </s-table-row>
                        );
                      })}
                    </s-table-body>
                  </s-table>

                  {/* Pagination */}
                  {totalConflictPages > 1 && (
                    <s-box paddingBlockStart="base">
                      <s-stack direction="inline" gap="small" justifyContent="center" alignItems="center">
                        <s-button
                          disabled={displayConflictPage === 1 ? true : undefined}
                          onClick={(e: any) => { e.preventDefault(); if (displayConflictPage > 1) setCurrentConflictPage(displayConflictPage - 1); }}
                        >
                          Previous
                        </s-button>
                        <s-text>Page {displayConflictPage} of {totalConflictPages}</s-text>
                        <s-button
                          disabled={displayConflictPage === totalConflictPages ? true : undefined}
                          onClick={(e: any) => { e.preventDefault(); if (displayConflictPage < totalConflictPages) setCurrentConflictPage(displayConflictPage + 1); }}
                        >
                          Next
                        </s-button>
                      </s-stack>
                    </s-box>
                  )}
                </>
              )}
            </s-stack>
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
