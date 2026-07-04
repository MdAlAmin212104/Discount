import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
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
    <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
      <s-box maxInlineSize="160px" maxBlockSize="160px">
        <s-image
          aspectRatio="1/0.5"
          src="https://cdn.shopify.com/static/images/polaris/patterns/callout.png"
          alt="Empty state graphic"
        />
      </s-box>
      <s-grid justifyItems="center" maxInlineSize="450px" gap="base">
        <s-stack alignItems="center">
          <s-heading>{title}</s-heading>
          <s-paragraph>{paragraph}</s-paragraph>
        </s-stack>
        <s-button-group>
          {!hideSecondary && (
            <s-button
              slot="secondary-actions"
              aria-label="Learn more about campaigns"
            >
              Learn more
            </s-button>
          )}
          <s-button slot="primary-action" onClick={onAction}>
            {actionLabel}
          </s-button>
        </s-button-group>
      </s-grid>
    </s-grid>
  );
}

export default function CampaignsList() {
  const { campaigns } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("created-desc");
  const [currentPage, setCurrentPage] = useState(1);

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
          <div style={{ borderBottom: "1px solid var(--p-border-subdued)", marginBottom: "16px", paddingBottom: "8px" }}>
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
                          <div style={{ marginTop: "4px", fontSize: "11px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ color: "#6d7175" }}>ID: {campaign.id}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(campaign.id);
                                alert("Campaign ID copied: " + campaign.id);
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "#008060",
                                cursor: "pointer",
                                padding: 0,
                                textDecoration: "underline",
                                fontSize: "11px",
                              }}
                            >
                              Copy
                            </button>
                          </div>
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
                          <s-button
                            variant="secondary"
                            onClick={() => navigate(`/app/campaigns/${campaign.id}`)}
                            icon="edit"
                          >
                            Edit
                          </s-button>
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
    </s-page>
  );
}
