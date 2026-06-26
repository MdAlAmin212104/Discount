import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useNavigate, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import { LogEvent, JobStatus } from "@prisma/client";

// TypeScript declarations for Shopify Web Components to bypass strict JSX compilation checks
declare global {
  namespace JSX {
    interface IntrinsicElements {
      's-page': any;
      's-section': any;
      's-card': any;
      's-stack': any;
      's-grid': any;
      's-text': any;
      's-button': any;
      's-text-field': any;
      's-select': any;
      's-checkbox': any;
      's-banner': any;
      's-heading': any;
      's-date-field': any;
      's-badge': any;
    }
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const campaign = await prisma.campaign.findFirst({
      where: { id, shopId: shop.id },
      include: { stages: { orderBy: { stageNumber: "asc" } }, products: true },
    });
    return { campaign };
  }
  return { campaign: null };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  try {
    const data = await request.json();
    const { id, name, discountType, timezone, startDateStr, notes, products, stages, status } = data;

    if (!name?.trim()) return { error: "Campaign name is required" };
    if (!stages?.length) return { error: "At least one stage is required" };
    if (!products?.length) return { error: "At least one product target is required" };

    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return { error: "Invalid start date" };

    let currentStart = new Date(start);
    const resolvedStages = stages.map((stage: any, index: number) => {
      const stageStart = new Date(currentStart);
      const stageEnd = new Date(currentStart);
      stageEnd.setDate(stageEnd.getDate() + parseInt(stage.durationDays || "0"));
      currentStart = new Date(stageEnd);
      return {
        stageNumber: index + 1,
        label: stage.label || `Stage ${index + 1}`,
        discountValue: parseFloat(stage.discountValue || "0"),
        startDate: stageStart,
        endDate: stageEnd,
      };
    });

    const campaignEnd = resolvedStages[resolvedStages.length - 1].endDate;

    let campaign;
    if (id) {
      // Edit mode: delete old stages and products, then update campaign
      const existingCampaign = await prisma.campaign.findFirst({
        where: { id, shopId: shop.id },
        include: { stages: true },
      });
      if (!existingCampaign) return { error: "Campaign not found" };

      await prisma.schedulerJob.deleteMany({
        where: { stageId: { in: existingCampaign.stages.map((s) => s.id) } },
      });
      await prisma.campaignStage.deleteMany({ where: { campaignId: id } });
      await prisma.campaignProduct.deleteMany({ where: { campaignId: id } });

      campaign = await prisma.campaign.update({
        where: { id },
        data: {
          name,
          discountType,
          timezone,
          startDate: start,
          endDate: campaignEnd,
          notes,
          status,
          products: { create: products.map((p: any) => ({ targetType: p.targetType, targetValue: p.targetValue })) },
          stages: { create: resolvedStages },
        },
        include: { stages: true },
      });
    } else {
      // Create mode
      campaign = await prisma.campaign.create({
        data: {
          shopId: shop.id,
          name,
          discountType,
          timezone,
          startDate: start,
          endDate: campaignEnd,
          notes,
          status,
          products: { create: products.map((p: any) => ({ targetType: p.targetType, targetValue: p.targetValue })) },
          stages: { create: resolvedStages },
        },
        include: { stages: true },
      });
    }

    if (status === "SCHEDULED") {
      for (const stage of campaign.stages) {
        await prisma.schedulerJob.create({
          data: { shopId: shop.id, stageId: stage.id, scheduledAt: stage.startDate, status: JobStatus.PENDING },
        });
      }
    }

    await prisma.activityLog.create({
      data: {
        shopId: shop.id,
        campaignId: campaign.id,
        event: id ? LogEvent.CAMPAIGN_UPDATED : LogEvent.CAMPAIGN_CREATED,
        message: `Campaign "${name}" ${id ? "updated" : "created"} as ${status === "SCHEDULED" ? "scheduled" : "draft"}.`,
      },
    });

    return { success: true, campaignId: campaign.id };
  } catch (error: any) {
    return { error: error.message || "Failed to save campaign" };
  }
};

const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "EST / EDT (New York, Boston)" },
  { value: "America/Chicago", label: "CST / CDT (Chicago, Houston)" },
  { value: "America/Denver", label: "MST / MDT (Denver, Salt Lake)" },
  { value: "America/Los_Angeles", label: "PST / PDT (Los Angeles, Seattle)" },
  { value: "Europe/London", label: "GMT / BST (London, Dublin)" },
  { value: "Europe/Paris", label: "CET / CEST (Paris, Berlin, Rome)" },
  { value: "Asia/Dubai", label: "GST (Dubai, Muscat)" },
  { value: "Asia/Kolkata", label: "IST (India, Mumbai)" },
  { value: "Asia/Singapore", label: "SGT (Singapore, Manila)" },
  { value: "Asia/Tokyo", label: "JST (Tokyo, Seoul)" },
  { value: "Australia/Sydney", label: "AEST / AEDT (Sydney, Melbourne)" },
];

export default function NewCampaign() {
  const { campaign } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Validation States
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form State
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIX_AMOUNT">("PERCENTAGE");
  const [timezone, setTimezone] = useState("UTC");
  const [status, setStatus] = useState<"DRAFT" | "SCHEDULED">("DRAFT");
  
  const [startDateStr, setStartDateStr] = useState(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000);
    const tzoffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
  });
  
  const [enableScheduling, setEnableScheduling] = useState(true);
  const [notes, setNotes] = useState("");
  const [targetType, setTargetType] = useState<"PRODUCT" | "COLLECTION" | "TAG">("PRODUCT");
  const [selectedResources, setSelectedResources] = useState<any[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [stages, setStages] = useState<any[]>([{ label: "Stage 1", discountValue: "10", durationDays: "3" }]);

  // Auto-detect timezone
  useEffect(() => {
    if (!campaign) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && TIMEZONES.some((t) => t.value === tz)) {
          setTimezone(tz);
        } else if (tz) {
          setTimezone(tz);
        }
      } catch (e) {}
    }
  }, [campaign]);

  // Load existing campaign data (Edit Mode)
  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDiscountType(campaign.discountType);
      setTimezone(campaign.timezone);
      setStatus(campaign.status === "ACTIVE" || campaign.status === "SCHEDULED" ? "SCHEDULED" : "DRAFT");
      setNotes(campaign.notes || "");
      
      const d = new Date(campaign.startDate);
      const tzoffset = d.getTimezoneOffset() * 60000;
      setStartDateStr(new Date(d.getTime() - tzoffset).toISOString().slice(0, 16));

      if (campaign.products?.length > 0) {
        const type = campaign.products[0].targetType;
        setTargetType(type);
        if (type === "TAG") {
          setTagsInput(campaign.products.map((p: any) => p.targetValue).join(", "));
        } else {
          setSelectedResources(campaign.products.map((p: any) => ({
            id: p.targetValue,
            title: p.targetValue.startsWith("gid://shopify/Product/")
              ? `Product (${p.targetValue.split("/").pop()})`
              : p.targetValue.startsWith("gid://shopify/Collection/")
              ? `Collection (${p.targetValue.split("/").pop()})`
              : p.targetValue
          })));
        }
      }

      if (campaign.stages?.length > 0) {
        setStages(campaign.stages.map((s: any) => {
          const start = new Date(s.startDate);
          const end = new Date(s.endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return {
            label: s.label || "",
            discountValue: s.discountValue.toString(),
            durationDays: diffDays.toString()
          };
        }));
      }
    }
  }, [campaign]);

  const openPicker = async () => {
    try {
      const selected = await (shopify as any).resourcePicker({
        type: targetType === "PRODUCT" ? "product" : "collection",
        multiple: true,
      });
      if (selected?.length) {
        setSelectedResources(selected);
        setErrors((prev) => ({ ...prev, targeting: "" }));
      }
    } catch (err: any) {
      shopify.toast.show("Could not open resource picker", { isError: true });
    }
  };

  const removeResource = (id: string) => {
    setSelectedResources((prev) => prev.filter((r) => r.id !== id));
  };

  const addStage = () => {
    setStages([...stages, { label: `Stage ${stages.length + 1}`, discountValue: "10", durationDays: "3" }]);
  };

  const removeStage = (idx: number) => {
    if (stages.length > 1) {
      setStages(stages.filter((_, i) => i !== idx));
    }
  };

  const updateStage = (i: number, key: string, val: string) => {
    const updated = [...stages];
    updated[i] = { ...updated[i], [key]: val };
    setStages(updated);
  };

  const handleMainDiscountChange = (val: string) => {
    updateStage(0, "discountValue", val);
  };

  const calculateStageDates = () => {
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return [];

    let currentStart = new Date(start);
    return stages.map((stage) => {
      const stageStart = new Date(currentStart);
      const stageEnd = new Date(currentStart);
      stageEnd.setDate(stageEnd.getDate() + parseInt(stage.durationDays || "0"));
      currentStart = new Date(stageEnd);
      return {
        start: stageStart,
        end: stageEnd,
      };
    });
  };

  const stageDates = calculateStageDates();

  const calculateEndDateStr = () => {
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return "";

    let current = new Date(start);
    stages.forEach((stage) => {
      const days = parseInt(stage.durationDays || "0");
      current.setDate(current.getDate() + days);
    });
    const tzoffset = current.getTimezoneOffset() * 60000;
    return new Date(current.getTime() - tzoffset).toISOString().slice(0, 16);
  };

  const endDateStr = calculateEndDateStr();

  const handleSave = (targetStatus: "DRAFT" | "SCHEDULED") => {
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) nextErrors.name = "Campaign name is required";
    
    if (enableScheduling) {
      if (!startDateStr) nextErrors.startDate = "Start date & time is required";
      else {
        const start = new Date(startDateStr);
        if (isNaN(start.getTime())) nextErrors.startDate = "Invalid start date & time";
      }
    }

    if (targetType === "TAG") {
      if (!tagsInput.trim()) nextErrors.targeting = "At least one product tag is required";
    } else {
      if (selectedResources.length === 0) {
        nextErrors.targeting = `At least one selected ${targetType === "PRODUCT" ? "product" : "collection"} is required`;
      }
    }

    stages.forEach((stage, idx) => {
      const val = parseFloat(stage.discountValue);
      const dur = parseInt(stage.durationDays);
      if (isNaN(val) || val <= 0) {
        nextErrors[`stage-${idx}-val`] = "Discount value must be greater than 0";
      }
      if (isNaN(dur) || dur <= 0) {
        nextErrors[`stage-${idx}-dur`] = "Duration must be at least 1 day";
      }
    });

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitError("Please fix validation errors before saving.");
      shopify.toast.show("Please fix validation errors first", { isError: true });
      return;
    }

    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsSubmitting(true);

    const products =
      targetType === "TAG"
        ? tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((tag) => ({ targetType: "TAG", targetValue: tag }))
        : selectedResources.map((r) => ({ targetType, targetValue: r.id }));

    fetch(window.location.pathname + window.location.search, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: campaign?.id,
        name,
        discountType,
        timezone,
        startDateStr,
        notes,
        products,
        stages,
        status: targetStatus,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        setIsSubmitting(false);
        if (d.error) {
          setSubmitError(d.error);
          shopify.toast.show(d.error, { isError: true });
        } else {
          setSubmitSuccess(targetStatus === "SCHEDULED" ? "Campaign successfully saved and active!" : "Campaign saved as Draft.");
          shopify.toast.show(targetStatus === "SCHEDULED" ? "Campaign Scheduled!" : "Draft Saved!");
          setTimeout(() => {
            navigate(`/app/campaigns/${d.campaignId}`);
          }, 1500);
        }
      })
      .catch((err) => {
        setIsSubmitting(false);
        setSubmitError("Something went wrong. Please try again.");
        shopify.toast.show("Something went wrong. Please try again.", { isError: true });
      });
  };

  return (
    <s-page heading={campaign ? "Edit Campaign" : "Create Campaign"}>
      <s-button slot="back-action" variant="tertiary" onClick={() => navigate("/app/campaigns")}>
        Campaigns
      </s-button>

      <div style={{ marginBottom: "20px" }}>
        <s-text tone="neutral">Configure your discount campaign settings.</s-text>
      </div>

      <s-stack direction="block" gap="large">
        {/* Banners */}
        {submitError && <s-banner tone="critical">{submitError}</s-banner>}
        {submitSuccess && <s-banner tone="success">{submitSuccess}</s-banner>}

        <s-grid>
          {/* Left Column: General Configuration */}
          <s-stack direction="block" gap="large">
            <s-card>
              <s-section heading="Campaign Information">
                <s-stack direction="block" gap="base">
                  <s-text-field
                    label="Campaign Name"
                    value={name}
                    onChange={(e: any) => {
                      setName(e.currentTarget.value);
                      setErrors((prev) => ({ ...prev, name: "" }));
                    }}
                    placeholder="Black Friday Promotion"
                    error={errors.name}
                  />

                  <s-grid>
                    <s-select
                      label="Campaign Type"
                      value={discountType}
                      onChange={(e: any) => setDiscountType(e.currentTarget.value as any)}
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIX_AMOUNT">Fixed Amount ($)</option>
                    </s-select>

                    <s-select
                      label="Campaign Status"
                      value={status}
                      onChange={(e: any) => setStatus(e.currentTarget.value as any)}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="SCHEDULED">Active / Scheduled</option>
                    </s-select>
                  </s-grid>

                  <s-text-field
                    label={`Discount Value (${discountType === "PERCENTAGE" ? "%" : "$"})`}
                    value={stages[0]?.discountValue || ""}
                    onChange={(e: any) => handleMainDiscountChange(e.currentTarget.value)}
                    placeholder="10"
                    error={errors["stage-0-val"]}
                  />
                </s-stack>
              </s-section>
            </s-card>

            <s-card>
              <s-section heading="Schedule">
                <s-stack direction="block" gap="base">
                  <s-checkbox
                    label="Enable scheduling"
                    id="enable-scheduling"
                    checked={enableScheduling}
                    onChange={(e: any) => setEnableScheduling(e.currentTarget.checked)}
                  />

                  {enableScheduling && (
                    <s-stack gap="base">
                      <s-heading>Campaign Period</s-heading>

                      <s-stack direction="inline" gap="base">
                        <s-date-field
                          label="Start date"
                          name="startDate"
                          id="report-start"
                          value={startDateStr}
                          onChange={(e: any) => {
                            setStartDateStr(e.currentTarget.value);
                            setErrors((prev) => ({ ...prev, startDate: "" }));
                          }}
                        ></s-date-field>

                        <s-date-field
                          label="End date"
                          name="endDate"
                          id="report-end"
                          value={endDateStr}
                          readOnly
                        ></s-date-field>
                      </s-stack>

                      <s-select
                        label="Timezone"
                        value={timezone}
                        onChange={(e: any) => setTimezone(e.currentTarget.value)}
                      >
                        {TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </s-select>
                    </s-stack>
                  )}
                </s-stack>
              </s-section>
            </s-card>

            <s-card>
              <s-section heading="Notes">
                <s-text-field
                  label="Internal Notes"
                  value={notes}
                  onChange={(e: any) => setNotes(e.currentTarget.value)}
                  placeholder="Internal tags or comments for merchants..."
                />
              </s-section>
            </s-card>
          </s-stack>

          {/* Right Column: Targeting & Stages */}
          <s-stack direction="block" gap="large">
            <s-card>
              <s-section heading="Product Selection">
                <s-stack direction="block" gap="base">
                  <s-select
                    label="Targeting Options"
                    value={targetType}
                    onChange={(e: any) => {
                      setTargetType(e.currentTarget.value as any);
                      setSelectedResources([]);
                      setTagsInput("");
                      setErrors((prev) => ({ ...prev, targeting: "" }));
                    }}
                  >
                    <option value="PRODUCT">Select Multiple Products</option>
                    <option value="COLLECTION">Select Product Collection</option>
                    <option value="TAG">Select Product Tag</option>
                  </s-select>

                  {targetType === "TAG" ? (
                    <s-text-field
                      label="Product Tags"
                      value={tagsInput}
                      onChange={(e: any) => {
                        setTagsInput(e.currentTarget.value);
                        setErrors((prev) => ({ ...prev, targeting: "" }));
                      }}
                      placeholder="winter-sale, BOGO"
                      error={errors.targeting}
                    />
                  ) : (
                    <s-stack direction="block" gap="small">
                      <s-button onClick={openPicker} variant="secondary">
                        Browse {targetType === "PRODUCT" ? "Products" : "Collections"}
                      </s-button>
                      {errors.targeting && (
                        <div style={{ marginTop: "4px" }}>
                          <s-text tone="critical">{errors.targeting}</s-text>
                        </div>
                      )}

                      {selectedResources.length > 0 && (
                        <div style={{ marginTop: "12px" }}>
                          <s-stack direction="block" gap="small">
                            <s-text font-weight="semibold">Selected Resources ({selectedResources.length}):</s-text>
                            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--p-border-subdued)", borderRadius: "6px", padding: "8px" }}>
                              {selectedResources.map((r) => (
                                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--p-border-subdued)" }}>
                                  <s-text>{r.title}</s-text>
                                  <s-button tone="critical" variant="tertiary" onClick={() => removeResource(r.id)}>
                                    Remove
                                  </s-button>
                                </div>
                              ))}
                            </div>
                          </s-stack>
                        </div>
                      )}
                    </s-stack>
                  )}
                </s-stack>
              </s-section>
            </s-card>

            <s-card>
              <s-section heading="Discount Settings (Stages)">
                <s-stack direction="block" gap="base">
                  <s-text tone="neutral">
                    Define step-by-step sequential pricing stages.
                  </s-text>

                  <s-stack direction="block" gap="small">
                    {stages.map((stage, idx) => {
                      const dates = stageDates[idx];
                      const valError = errors[`stage-${idx}-val`];
                      const durError = errors[`stage-${idx}-dur`];

                      return (
                        <div key={idx} style={{ border: "1px solid var(--p-border-subdued)", borderRadius: "8px", padding: "12px", marginBottom: "8px" }}>
                          <s-stack direction="block" gap="small">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <s-text font-weight="semibold">Stage {idx + 1}</s-text>
                              {stages.length > 1 && (
                                <s-button tone="critical" variant="tertiary" onClick={() => removeStage(idx)}>
                                  Remove
                                </s-button>
                              )}
                            </div>

                            <s-text-field
                              label="Stage Label"
                              value={stage.label}
                              onChange={(e: any) => updateStage(idx, "label", e.currentTarget.value)}
                              placeholder={`Stage ${idx + 1}`}
                            />

                            <s-grid>
                              <div>
                                <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--p-color-text, #303030)", marginBottom: "4px", display: "block" }}>
                                  Discount ({discountType === "PERCENTAGE" ? "%" : "$"})
                                </label>
                                <input
                                  type="number"
                                  style={{
                                    width: "100%",
                                    height: "36px",
                                    padding: "8px 12px",
                                    border: valError ? "1px solid var(--p-color-border-critical, #bf0711)" : "1px solid var(--p-color-border, #e1e3e5)",
                                    borderRadius: "6px",
                                    fontFamily: "inherit",
                                    fontSize: "14px",
                                    boxSizing: "border-box",
                                    backgroundColor: "var(--p-color-bg-surface, #ffffff)",
                                    color: "var(--p-color-text, #303030)",
                                    outline: "none"
                                  }}
                                  value={stage.discountValue}
                                  onChange={(e) => {
                                    updateStage(idx, "discountValue", e.target.value);
                                    setErrors((prev) => ({ ...prev, [`stage-${idx}-val`]: "" }));
                                  }}
                                />
                                {valError && (
                                  <div style={{ marginTop: "4px" }}>
                                    <s-text tone="critical">{valError}</s-text>
                                  </div>
                                )}
                              </div>

                              <div>
                                <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--p-color-text, #303030)", marginBottom: "4px", display: "block" }}>
                                  Duration (Days)
                                </label>
                                <input
                                  type="number"
                                  style={{
                                    width: "100%",
                                    height: "36px",
                                    padding: "8px 12px",
                                    border: durError ? "1px solid var(--p-color-border-critical, #bf0711)" : "1px solid var(--p-color-border, #e1e3e5)",
                                    borderRadius: "6px",
                                    fontFamily: "inherit",
                                    fontSize: "14px",
                                    boxSizing: "border-box",
                                    backgroundColor: "var(--p-color-bg-surface, #ffffff)",
                                    color: "var(--p-color-text, #303030)",
                                    outline: "none"
                                  }}
                                  value={stage.durationDays}
                                  onChange={(e) => {
                                    updateStage(idx, "durationDays", e.target.value);
                                    setErrors((prev) => ({ ...prev, [`stage-${idx}-dur`]: "" }));
                                  }}
                                />
                                {durError && (
                                  <div style={{ marginTop: "4px" }}>
                                    <s-text tone="critical">{durError}</s-text>
                                  </div>
                                )}
                              </div>
                            </s-grid>

                            {dates && (
                              <s-text tone="neutral">
                                📅 Runs: {dates.start.toLocaleDateString()} to {dates.end.toLocaleDateString()}
                              </s-text>
                            )}
                          </s-stack>
                        </div>
                      );
                    })}
                  </s-stack>

                  <s-button onClick={addStage} variant="secondary">
                    Add Stage
                  </s-button>
                </s-stack>
              </s-section>
            </s-card>
          </s-stack>
        </s-grid>

        {/* Action Buttons */}
        <div style={{ marginTop: "24px" }}>
          <s-stack direction="inline" justify-content="space-between" align-items="center">
            <s-button onClick={() => navigate("/app/campaigns")}>Cancel</s-button>
            <s-stack direction="inline" gap="base">
              <s-button onClick={() => handleSave("DRAFT")} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save as Draft"}
              </s-button>
              <s-button variant="primary" onClick={() => handleSave("SCHEDULED")} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : campaign ? "Save Campaign" : "Create Campaign"}
              </s-button>
            </s-stack>
          </s-stack>
        </div>
      </s-stack>
    </s-page>
  );
}
