import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit, useActionData, useNavigation } from "react-router";
import { useState, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import { CampaignStatus, StageStatus } from "@prisma/client";
import { updateVariantPriceWithRetry } from "../services/shopify-price.server";
import { useAppBridge } from "@shopify/app-bridge-react";

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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const formData = await request.formData();
  const intent = formData.get("intent");
  const campaignId = formData.get("id") as string;

  if (intent === "DELETE") {
    try {
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, shopId: shop.id },
        include: { stages: true },
      });
      if (!campaign) return { error: "Campaign not found" };

      // Restore variants logic
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

      await prisma.schedulerJob.deleteMany({ where: { stageId: { in: campaign.stages.map((s) => s.id) } } });
      await prisma.variantPriceSnapshot.deleteMany({ where: { campaignId: campaign.id } });
      await prisma.campaign.delete({ where: { id: campaign.id } });
      return { success: true };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  return { error: "Unknown intent" };
};

const STATUS_TABS = ["ALL", "ACTIVE", "SCHEDULED", "DRAFT", "COMPLETED"];

function StatusBadge({ status }: { status: CampaignStatus }) {
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

function useWebComponentChoice(
  ref: React.RefObject<HTMLElement | null>,
  onChange: (value: string) => void
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      const targetList = el as any;
      const targetEl = e.target as any;

      const values = targetList?.values ?? targetEl?.values;
      if (Array.isArray(values) && values.length > 0) {
        onChangeRef.current(values[0]);
        return;
      }

      const val =
        ce.detail?.value ??
        targetEl?.value ??
        targetList?.value;

      if (val) {
        onChangeRef.current(val);
      }
    };

    el.addEventListener("change", handler);
    el.addEventListener("s-change", handler);
    return () => {
      el.removeEventListener("change", handler);
      el.removeEventListener("s-change", handler);
    };
  }, [ref]);
}

function EmptyStateIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto' }}>
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f4f6f8" />
          <stop offset="100%" stopColor="#e3e6e9" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3f51b5" />
          <stop offset="100%" stopColor="#008060" />
        </linearGradient>
        <linearGradient id="sparkleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffeb3b" />
          <stop offset="100%" stopColor="#ff9800" />
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.06" />
        </filter>
      </defs>
      {/* Outer dotted circle */}
      <circle cx="60" cy="60" r="54" fill="none" stroke="#dfe3e8" strokeWidth="2" strokeDasharray="6 4" />
      {/* Soft background shape */}
      <circle cx="60" cy="60" r="44" fill="url(#bgGrad)" />
      
      {/* Calendar / Schedule card */}
      <g filter="url(#shadow)">
        <rect x="36" y="32" width="48" height="56" rx="8" fill="#ffffff" stroke="#e1e3e5" strokeWidth="1.5" />
        {/* Calendar top binder */}
        <rect x="36" y="32" width="48" height="12" rx="4" fill="url(#accentGrad)" />
        {/* Binder holes */}
        <circle cx="46" cy="38" r="2" fill="#ffffff" />
        <circle cx="60" cy="38" r="2" fill="#ffffff" />
        <circle cx="74" cy="38" r="2" fill="#ffffff" />
        
        {/* Grid lines inside calendar */}
        <rect x="44" y="52" width="8" height="6" rx="1.5" fill="#f1f2f4" />
        <rect x="56" y="52" width="8" height="6" rx="1.5" fill="#f1f2f4" />
        <rect x="68" y="52" width="8" height="6" rx="1.5" fill="#f1f2f4" />
        
        <rect x="44" y="62" width="8" height="6" rx="1.5" fill="#f1f2f4" />
        <rect x="56" y="62" width="8" height="6" rx="1.5" fill="#dfe3e8" />
        <rect x="68" y="62" width="8" height="6" rx="1.5" fill="#f1f2f4" />

        <rect x="44" y="72" width="8" height="6" rx="1.5" fill="#f1f2f4" />
        <rect x="56" y="72" width="8" height="6" rx="1.5" fill="#f1f2f4" />
        <rect x="68" y="72" width="8" height="6" rx="1.5" fill="#f1f2f4" />
      </g>

      {/* Floating Badge (Percent sign / Sale) */}
      <g filter="url(#shadow)">
        <circle cx="82" cy="74" r="16" fill="#008060" />
        {/* Percent symbol inside badge */}
        <path d="M78 78 L86 70" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="78.5" cy="71.5" r="1.5" fill="#ffffff" />
        <circle cx="85.5" cy="76.5" r="1.5" fill="#ffffff" />
      </g>

      {/* Small sparkles to indicate empty/new status */}
      <path d="M28 42 L30 38 L32 42 L28 42" fill="url(#sparkleGrad)" />
      <path d="M92 34 L93.5 31 L95 34 L92 34" fill="url(#sparkleGrad)" />
    </svg>
  );
}

function EmptyState({
  title,
  paragraph,
  actionLabel,
  onAction,
  hideSecondary
}: {
  title: string;
  paragraph: string;
  actionLabel: string;
  onAction: () => void;
  hideSecondary?: boolean;
}) {
  return (
    <>
      <s-section>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <s-card>
            <div style={{ maxWidth: "520px", width: "100%", margin: "0 auto" }}>
              <s-box padding="large-500">
                <div style={{ textAlign: "center" }}>
                  <s-grid gap="large" justifyItems="center">
                    <div style={{ marginBottom: "8px" }}>
                      <s-box maxInlineSize="160px" maxBlockSize="160px">
                        <EmptyStateIllustration />
                      </s-box>
                    </div>
                    <s-grid justifyItems="center" gap="base">
                      <s-stack alignItems="center" gap="small">
                        <div style={{ fontSize: "20px", fontWeight: "600" }}>
                          <s-heading heading-alignment="center">
                            {title}
                          </s-heading>
                        </div>
                        <div style={{ color: "var(--p-color-text-secondary)", fontSize: "14px", lineHeight: "20px" }}>
                          <s-paragraph text-alignment="center">
                            {paragraph}
                          </s-paragraph>
                        </div>
                      </s-stack>
                      <s-box paddingBlockStart="small">
                        <s-stack direction="inline" gap="small" justifyContent="center">
                          <s-button
                            variant="primary"
                            onClick={onAction}
                            aria-label={actionLabel}
                          >
                            {actionLabel}
                          </s-button>
                          {!hideSecondary && (
                            <s-button
                              variant="secondary"
                              aria-label="Learn more about campaigns"
                              href="/app/theme-settings"
                            >
                              Customize widget
                            </s-button>
                          )}
                        </s-stack>
                      </s-box>
                    </s-grid>
                  </s-grid>
                </div>
              </s-box>
            </div>
          </s-card>
        </div>
      </s-section>
      {!hideSecondary && (
        <s-section slot="aside">
          <s-card>
            <s-box padding="base">
              <s-stack gap="base" alignItems="center">
                <s-heading heading-alignment="center">Resources & Help</s-heading>
                <div style={{ color: "var(--p-color-text-secondary)", fontSize: "13px", textAlign: "center" }}>
                  <s-paragraph text-alignment="center">
                    Find guides and tutorials on how to set up active campaign discount schedules, optimize buyer engagement, and drive higher store conversions.
                  </s-paragraph>
                </div>
                <s-box paddingBlockStart="small">
                  <s-button
                    variant="secondary"
                    href="/"

                  >
                    Request Support
                  </s-button>
                </s-box>
              </s-stack>
            </s-box>
          </s-card>
        </s-section>
      )}
    </>
  );
}

export default function CampaignsList() {
  const { campaigns } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const isSaving = navigation.state !== "idle" && navigation.formMethod === "POST";

  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("created-desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [campaignToDelete, setCampaignToDelete] = useState<{ id: string; name: string } | null>(null);

  const sortChoiceRef = useRef<any>(null);

  // Wire sort selector via useWebComponentChoice
  useWebComponentChoice(sortChoiceRef, (val) => {
    setSortBy(val);
    setCurrentPage(1);
  });

  // Sync selected choice list values imperatively
  useEffect(() => {
    const list = sortChoiceRef.current;
    if (!list) return;
    (list as any).values = [sortBy];
    const choices = list.querySelectorAll("s-choice");
    choices.forEach((c: any) => {
      const val = c.getAttribute("value");
      if (val === sortBy) {
        c.setAttribute("selected", "");
        c.selected = true;
      } else {
        c.removeAttribute("selected");
        c.selected = false;
      }
    });
  }, [sortBy]);

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("Campaign deleted");
      setCampaignToDelete(null);
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData]);

  // Filter campaigns
  const filtered = campaigns.filter((c) => {
    const mappedStatus = c.status === "PAUSED" ? "DRAFT" : c.status;
    const matchesTab = activeTab === 0 ? true : mappedStatus === STATUS_TABS[activeTab];
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  // Sort campaigns
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name-asc") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "name-desc") {
      return b.name.localeCompare(a.name);
    }
    if (sortBy === "created-asc") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    // Default: created-desc
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Pagination calculations (10 campaigns per page)
  const totalPages = Math.ceil(sorted.length / 10) || 1;
  const displayPage = Math.min(currentPage, totalPages);
  const paginatedCampaigns = sorted.slice((displayPage - 1) * 10, displayPage * 10);

  // Dynamic empty state info based on filters
  const getEmptyStateDetails = () => {
    if (searchQuery) {
      return {
        title: "No campaigns found",
        paragraph: `No campaigns matched your search for "${searchQuery}". Try editing or clearing your search term.`,
        actionLabel: "Clear search",
        onAction: () => {
          setSearchQuery("");
          setCurrentPage(1);
        }
      };
    }
    const tabName = STATUS_TABS[activeTab].toLowerCase();
    return {
      title: `No ${tabName} campaigns`,
      paragraph: `You don't have any campaigns currently in ${tabName} status.`,
      actionLabel: "Create campaign",
      onAction: () => navigate("/app/campaigns/new")
    };
  };

  return (
    <s-page heading="Campaigns">
      {campaigns.length > 0 && (
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={() => navigate("/app/campaigns/new")}
        >
          New Campaign
        </s-button>
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          title="Start creating campaigns"
          paragraph="Create and manage your schedule of discount campaigns for customers to enjoy."
          actionLabel="Create campaign"
          onAction={() => navigate("/app/campaigns/new")}
        />
      ) : (
        <>
          {/* Tab Bar */}
          <s-section>
            <div style={{ borderBottom: "1px solid var(--p-border-subdued)"}}>
            <s-stack direction="inline" gap="small">
              {STATUS_TABS.map((tab, i) => (
                <s-button
                  key={tab}
                  variant={activeTab === i ? "primary" : "tertiary"}
                  onClick={() => {
                    setActiveTab(i);
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                >
                  {tab.charAt(0) + tab.slice(1).toLowerCase()}
                </s-button>
              ))}
            </s-stack>
          </div>
          </s-section>
          

          <s-section padding="none" accessibilityLabel="Campaigns table section">
            <s-table>
              <s-grid slot="filters" gap="small-200" gridTemplateColumns="1fr auto">
                <s-text-field
                  label="Search campaigns"
                  labelAccessibilityVisibility="exclusive"
                  icon="search"
                  placeholder="Search all campaigns"
                  value={searchQuery}
                  onChange={(e: any) => {
                    setSearchQuery(e.currentTarget.value);
                    setCurrentPage(1);
                  }}
                />
                <s-button
                  icon="sort"
                  variant="secondary"
                  accessibilityLabel="Sort"
                  commandFor="sort-actions"
                />
                <s-popover id="sort-actions">
                  <s-stack gap="none">
                    <s-box padding="small">
                      <s-choice-list ref={sortChoiceRef} label="Sort by" name="Sort by">
                        <s-choice value="created-desc">Newest first</s-choice>
                        <s-choice value="created-asc">Oldest first</s-choice>
                        <s-choice value="name-asc">Campaign name (A-Z)</s-choice>
                        <s-choice value="name-desc">Campaign name (Z-A)</s-choice>
                      </s-choice-list>
                    </s-box>
                  </s-stack>
                </s-popover>
              </s-grid>

              {paginatedCampaigns.length > 0 && (
                <>
                  <s-table-header-row>
                    <s-table-header listSlot="primary">Campaign</s-table-header>
                    <s-table-header listSlot="secondary">Status</s-table-header>
                    <s-table-header>Type</s-table-header>
                    <s-table-header format="numeric">Stages</s-table-header>
                    <s-table-header>Date Range</s-table-header>
                    <s-table-header format="numeric">Actions</s-table-header>
                  </s-table-header-row>

                  <s-table-body>
                    {paginatedCampaigns.map((campaign) => (
                      <s-table-row key={campaign.id}>
                        <s-table-cell>
                          <s-link onClick={() => navigate(`/app/campaigns/${campaign.id}`)}>
                            {campaign.name}
                          </s-link>
                        </s-table-cell>
                        <s-table-cell>
                          <StatusBadge status={campaign.status} />
                        </s-table-cell>
                        <s-table-cell>
                          <s-text>{campaign.discountType === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}</s-text>
                        </s-table-cell>
                        <s-table-cell>{campaign.stages.length}</s-table-cell>
                        <s-table-cell>
                          <s-text>
                            {new Date(campaign.startDate).toLocaleDateString()} -{" "}
                            {new Date(campaign.endDate).toLocaleDateString()}
                          </s-text>
                        </s-table-cell>
                        <s-table-cell>
                          <s-stack direction="inline" justifyContent="end" gap="small">
                             <s-button
                              variant="primary"
                              onClick={() => navigate(`/app/campaigns/${campaign.id}`)}
                              icon="edit"
                            />
                            <s-button
                              variant="primary"
                              tone="critical"
                              icon="delete"
                              commandFor="delete-modal"
                              command="--show"
                              onClick={() => setCampaignToDelete({ id: campaign.id, name: campaign.name })}
                            />
                            </s-stack>
                         
                        </s-table-cell>
                      </s-table-row>
                    ))}
                  </s-table-body>
                </>
              )}
            </s-table>

            {paginatedCampaigns.length === 0 && (
              <s-box paddingBlockStart="base" paddingBlockEnd="base">
                <EmptyState
                  title={getEmptyStateDetails().title}
                  paragraph={getEmptyStateDetails().paragraph}
                  actionLabel={getEmptyStateDetails().actionLabel}
                  onAction={getEmptyStateDetails().onAction}
                  hideSecondary={true}
                />
              </s-box>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="small" justifyContent="center" alignItems="center">
                  <s-button
                    disabled={displayPage === 1 ? true : undefined}
                    onClick={(e: any) => {
                      e.preventDefault();
                      if (displayPage > 1) setCurrentPage(displayPage - 1);
                    }}
                  >
                    Previous
                  </s-button>
                  <s-text>Page {displayPage} of {totalPages}</s-text>
                  <s-button
                    disabled={displayPage === totalPages ? true : undefined}
                    onClick={(e: any) => {
                      e.preventDefault();
                      if (displayPage < totalPages) setCurrentPage(displayPage + 1);
                    }}
                  >
                    Next
                  </s-button>
                </s-stack>
              </s-box>
            )}
          </s-section>
        </>
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
              Are you sure you want to delete the campaign <strong>{campaignToDelete?.name}</strong>? This action cannot be undone and baseline prices will be restored.
            </s-text>
          </s-stack>
        </s-box>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          commandFor="delete-modal"
          command="--hide"
          loading={isSaving ? true : undefined}
          onClick={() => submit({ intent: "DELETE", id: campaignToDelete?.id || "" }, { method: "POST" })}
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
