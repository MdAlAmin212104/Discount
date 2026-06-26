import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import { LogEvent, JobStatus } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  try {
    const data = await request.json();
    const { name, discountType, timezone, startDateStr, notes, products, stages, status } = data;

    if (!name?.trim()) return { error: "Campaign name is required" };
    if (!stages?.length) return { error: "At least one stage is required" };
    if (!products?.length) return { error: "At least one target is required" };

    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return { error: "Invalid start date" };

    let currentStart = new Date(start);
    const resolvedStages = stages.map((stage: any, index: number) => {
      const stageStart = new Date(currentStart);
      const stageEnd = new Date(currentStart);
      stageEnd.setDate(stageEnd.getDate() + parseInt(stage.durationDays));
      currentStart = new Date(stageEnd);
      return {
        stageNumber: index + 1,
        label: stage.label || `Stage ${index + 1}`,
        discountValue: parseFloat(stage.discountValue),
        startDate: stageStart,
        endDate: stageEnd,
      };
    });

    const campaignEnd = resolvedStages[resolvedStages.length - 1].endDate;

    const campaign = await prisma.campaign.create({
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
        event: LogEvent.CAMPAIGN_CREATED,
        message: `Campaign "${name}" ${status === "SCHEDULED" ? "scheduled" : "saved as draft"}.`,
      },
    });

    return { success: true, campaignId: campaign.id };
  } catch (error: any) {
    return { error: error.message || "Failed to create campaign" };
  }
};

const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "EST / EDT (New York, Toronto)" },
  { value: "America/Chicago", label: "CST / CDT (Chicago, Winnipeg)" },
  { value: "America/Denver", label: "MST / MDT (Denver, Edmonton)" },
  { value: "America/Los_Angeles", label: "PST / PDT (Los Angeles, Vancouver)" },
  { value: "Europe/London", label: "GMT / BST (London, Dublin)" },
  { value: "Europe/Paris", label: "CET / CEST (Paris, Berlin, Rome)" },
  { value: "Asia/Dubai", label: "GST (Dubai, Muscat)" },
  { value: "Asia/Kolkata", label: "IST (India, Colombo)" },
  { value: "Asia/Singapore", label: "SGT (Singapore, Manila)" },
  { value: "Asia/Tokyo", label: "JST (Tokyo, Seoul)" },
  { value: "Australia/Sydney", label: "AEST / AEDT (Sydney, Melbourne)" },
];

export default function NewCampaign() {
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation States
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIX_AMOUNT">("PERCENTAGE");
  const [timezone, setTimezone] = useState("UTC");
  const [startDateStr, setStartDateStr] = useState(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000);
    // Format to YYYY-MM-DDTHH:mm
    const tzoffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
    return localISOTime;
  });
  const [notes, setNotes] = useState("");
  const [targetType, setTargetType] = useState<"PRODUCT" | "COLLECTION" | "TAG">("PRODUCT");
  const [selectedResources, setSelectedResources] = useState<any[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [stages, setStages] = useState([{ label: "Stage 1", discountValue: "10", durationDays: "3" }]);

  // Auto-detect timezone
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && TIMEZONES.some((t) => t.value === tz)) {
        setTimezone(tz);
      } else if (tz) {
        setTimezone(tz);
      }
    } catch (e) {}
  }, []);

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

  // Helper: calculate stages date timeline
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

  const handleNextStep = () => {
    const nextErrors: Record<string, string> = {};

    if (step === 1) {
      if (!name.trim()) nextErrors.name = "Campaign name is required";
      if (!startDateStr) nextErrors.startDate = "Start date & time is required";
      else {
        const start = new Date(startDateStr);
        if (isNaN(start.getTime())) nextErrors.startDate = "Invalid start date & time";
      }
    } else if (step === 2) {
      if (targetType === "TAG") {
        if (!tagsInput.trim()) nextErrors.targeting = "At least one product tag is required";
      } else {
        if (selectedResources.length === 0) {
          nextErrors.targeting = `At least one selected ${targetType === "PRODUCT" ? "product" : "collection"} is required`;
        }
      }
    } else if (step === 3) {
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
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      shopify.toast.show("Please fix validation errors first", { isError: true });
      return;
    }

    setErrors({});
    setStep((prev) => prev + 1);
  };

  const handleBackStep = () => {
    setErrors({});
    setStep((prev) => Math.max(1, prev - 1));
  };

  const submit = (status: "DRAFT" | "SCHEDULED") => {
    setIsSubmitting(true);
    const products =
      targetType === "TAG"
        ? tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((tag) => ({ targetType: "TAG", targetValue: tag }))
        : selectedResources.map((r) => ({ targetType, targetValue: r.id }));

    fetch(window.location.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, discountType, timezone, startDateStr, notes, products, stages, status }),
    })
      .then((r) => r.json())
      .then((d) => {
        setIsSubmitting(false);
        if (d.error) {
          shopify.toast.show(d.error, { isError: true });
        } else {
          shopify.toast.show(status === "SCHEDULED" ? "Campaign Scheduled!" : "Draft Saved!");
          navigate(`/app/campaigns/${d.campaignId}`);
        }
      })
      .catch((err) => {
        setIsSubmitting(false);
        shopify.toast.show("Something went wrong. Please try again.", { isError: true });
      });
  };

  const styles = `
    .stepper-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      background: var(--p-color-bg-surface, #ffffff);
      padding: 16px 24px;
      border-radius: 8px;
      border: 1px solid var(--p-color-border, #e1e3e5);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .step-item {
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
      flex: 1;
    }
    .step-item:not(:last-child)::after {
      content: '';
      height: 2px;
      background: var(--p-color-border, #e1e3e5);
      flex: 1;
      margin: 0 16px;
    }
    .step-item.completed:not(:last-child)::after {
      background: #008060;
    }
    .step-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid var(--p-color-border, #e1e3e5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      color: #616161;
      background: var(--p-color-bg-surface, #ffffff);
      transition: all 0.2s ease;
    }
    .step-item.active .step-circle {
      border-color: #008060;
      background: #f0fdf4;
      color: #008060;
      box-shadow: 0 0 0 3px rgba(0, 128, 96, 0.15);
    }
    .step-item.completed .step-circle {
      border-color: #008060;
      background: #008060;
      color: #ffffff;
    }
    .step-label {
      font-size: 14px;
      font-weight: 500;
      color: #616161;
    }
    .step-item.active .step-label {
      color: #303030;
      font-weight: 600;
    }
    .step-item.completed .step-label {
      color: #303030;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin: 8px 0 20px 0;
    }
    .selection-card {
      border: 2px solid var(--p-color-border, #e1e3e5);
      border-radius: 8px;
      padding: 20px;
      cursor: pointer;
      background: var(--p-color-bg-surface, #ffffff);
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;
      text-align: left;
      width: 100%;
      box-sizing: border-box;
    }
    .selection-card:hover {
      border-color: var(--p-color-border-hover, #8a8b8d);
      background: var(--p-color-bg-surface-hover, #fafafa);
    }
    .selection-card.selected {
      border-color: #008060;
      background: #f0fdf4;
    }
    .selection-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .selection-card-title {
      font-size: 15px;
      font-weight: 600;
      color: #303030;
    }
    .selection-card-desc {
      font-size: 13px;
      color: #616161;
      line-height: 1.45;
    }
    .selection-card-check {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #008060;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 11px;
    }
    .resource-list {
      border: 1px solid var(--p-color-border, #e1e3e5);
      border-radius: 8px;
      overflow: hidden;
      background: var(--p-color-bg-surface, #ffffff);
      margin-top: 16px;
      max-height: 300px;
      overflow-y: auto;
    }
    .resource-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      gap: 16px;
      border-bottom: 1px solid var(--p-color-border, #e1e3e5);
    }
    .resource-item:last-child {
      border-bottom: none;
    }
    .resource-img {
      width: 40px;
      height: 40px;
      border-radius: 4px;
      object-fit: cover;
      border: 1px solid var(--p-color-border, #e1e3e5);
      background: #f6f6f7;
    }
    .resource-info {
      flex: 1;
    }
    .resource-title {
      font-size: 14px;
      font-weight: 500;
      color: #303030;
    }
    .resource-remove {
      background: none;
      border: none;
      color: #bf0711;
      cursor: pointer;
      font-size: 13px;
      padding: 6px 12px;
      border-radius: 4px;
      transition: background 0.2s;
      font-weight: 500;
    }
    .resource-remove:hover {
      background: #fff1f0;
    }
    .stage-card {
      border: 1px solid var(--p-color-border, #e1e3e5);
      border-radius: 8px;
      background: var(--p-color-bg-surface, #ffffff);
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      margin-bottom: 20px;
      position: relative;
    }
    .stage-card:hover {
      border-color: var(--p-color-border-hover, #8a8b8d);
    }
    .stage-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .stage-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .stage-badge-number {
      background: #e1e3e5;
      color: #303030;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .stage-card-fields {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 600px) {
      .stage-card-fields {
        grid-template-columns: 1fr;
      }
    }
    .stage-summary-callout {
      margin-top: 16px;
      padding: 10px 14px;
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      border-radius: 0 6px 6px 0;
      font-size: 13px;
      color: #1e40af;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .review-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 768px) {
      .review-grid {
        grid-template-columns: 1fr;
      }
    }
    .review-section {
      border: 1px solid var(--p-color-border, #e1e3e5);
      border-radius: 8px;
      background: var(--p-color-bg-surface, #ffffff);
      padding: 20px;
    }
    .review-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--p-color-border, #e1e3e5);
      font-size: 14px;
    }
    .review-row:last-child {
      border-bottom: none;
    }
    .review-row-label {
      font-weight: 500;
      color: #616161;
    }
    .review-row-value {
      font-weight: 600;
      color: #303030;
    }
    .validation-error {
      color: #bf0711;
      font-size: 12px;
      margin-top: 4px;
      font-weight: 500;
    }
    .timeline-vertical {
      position: relative;
      padding-left: 24px;
      margin-top: 16px;
    }
    .timeline-vertical::before {
      content: '';
      position: absolute;
      left: 7px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background: #e1e3e5;
    }
    .timeline-item {
      position: relative;
      margin-bottom: 20px;
    }
    .timeline-item:last-child {
      margin-bottom: 0;
    }
    .timeline-marker {
      position: absolute;
      left: -24px;
      top: 4px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #3b82f6;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 1px #e1e3e5;
    }
    .timeline-content {
      font-size: 13.5px;
    }
    .polaris-input {
      width: 100%;
      height: 36px;
      padding: 8px 12px;
      border: 1px solid var(--p-color-border, #e1e3e5);
      border-radius: 6px;
      font-family: inherit;
      font-size: 14px;
      box-sizing: border-box;
      background: var(--p-color-bg-surface, #ffffff);
      color: var(--p-color-text, #303030);
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .polaris-input:focus {
      border-color: #008060;
      box-shadow: 0 0 0 2px rgba(0, 128, 96, 0.15);
    }
    .polaris-textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--p-color-border, #e1e3e5);
      border-radius: 6px;
      font-family: inherit;
      font-size: 14px;
      box-sizing: border-box;
      background: var(--p-color-bg-surface, #ffffff);
      color: var(--p-color-text, #303030);
      outline: none;
      resize: vertical;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .polaris-textarea:focus {
      border-color: #008060;
      box-shadow: 0 0 0 2px rgba(0, 128, 96, 0.15);
    }
    .polaris-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--p-color-text, #303030);
      margin-bottom: 4px;
      display: block;
    }
    .polaris-helptext {
      font-size: 12px;
      color: var(--p-color-text-secondary, #616161);
      margin-top: 4px;
    }
    .polaris-heading-md {
      font-size: 16px;
      font-weight: 600;
      color: var(--p-color-text, #303030);
    }
  `;

  return (
    <s-page heading="Create Discount Campaign">
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <s-button slot="back-action" variant="tertiary" onClick={() => navigate("/app/campaigns")}>
        Campaigns
      </s-button>

      {/* Modern Stepper */}
      <div className="stepper-container">
        {[
          { num: 1, label: "Info" },
          { num: 2, label: "Targeting" },
          { num: 3, label: "Stages" },
          { num: 4, label: "Review" },
        ].map((s) => (
          <div key={s.num} className={`step-item ${step === s.num ? "active" : ""} ${step > s.num ? "completed" : ""}`}>
            <div className="step-circle">{step > s.num ? "✓" : s.num}</div>
            <div className="step-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* STEP 1: Campaign Info */}
      {step === 1 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Campaign Details</s-heading>

            <s-stack direction="block" gap="small">
              <s-text-field
                label="Campaign Name"
                value={name}
                onChange={(e: any) => {
                  setName(e.currentTarget.value);
                  setErrors((prev) => ({ ...prev, name: "" }));
                }}
                placeholder="Black Friday 2026 Special"
              />
              {errors.name && <div className="validation-error">{errors.name}</div>}
            </s-stack>

            <s-stack direction="block" gap="small">
              <span className="polaris-label" style={{ fontWeight: "600" }}>Discount Type</span>
              <div className="cards-grid">
                <button
                  type="button"
                  className={`selection-card ${discountType === "PERCENTAGE" ? "selected" : ""}`}
                  onClick={() => setDiscountType("PERCENTAGE")}
                >
                  <div className="selection-card-header">
                    <span style={{ fontSize: "20px", fontWeight: "bold", color: "#008060" }}>%</span>
                    {discountType === "PERCENTAGE" && <div className="selection-card-check">✓</div>}
                  </div>
                  <div className="selection-card-title">Percentage Discount</div>
                  <div className="selection-card-desc">
                    Reduces product prices by a percentage value. Perfect for seasonal campaigns.
                  </div>
                </button>

                <button
                  type="button"
                  className={`selection-card ${discountType === "FIX_AMOUNT" ? "selected" : ""}`}
                  onClick={() => setDiscountType("FIX_AMOUNT")}
                >
                  <div className="selection-card-header">
                    <span style={{ fontSize: "20px", fontWeight: "bold", color: "#008060" }}>$</span>
                    {discountType === "FIX_AMOUNT" && <div className="selection-card-check">✓</div>}
                  </div>
                  <div className="selection-card-title">Fixed Amount Discount</div>
                  <div className="selection-card-desc">
                    Deducts a flat rate from the original price. Great for promotions like "$10 off".
                  </div>
                </button>
              </div>
            </s-stack>

            <s-stack direction="inline" gap="base">
              <div style={{ flex: 1 }}>
                <label className="polaris-label">Campaign Start Date and Time</label>
                <input
                  type="datetime-local"
                  className="polaris-input"
                  value={startDateStr}
                  onChange={(e) => {
                    setStartDateStr(e.target.value);
                    setErrors((prev) => ({ ...prev, startDate: "" }));
                  }}
                />
                {errors.startDate && <div className="validation-error">{errors.startDate}</div>}
              </div>

              <div style={{ flex: 1 }}>
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
              </div>
            </s-stack>

            <div>
              <label className="polaris-label">Admin Notes (Optional)</label>
              <textarea
                className="polaris-textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes about the campaign objectives and goals..."
              />
            </div>

            <s-stack direction="inline" justify-content="end">
              <s-button variant="primary" onClick={handleNextStep}>
                Next: Product Targeting
              </s-button>
            </s-stack>
          </s-stack>
        </s-grid>
      )}

      {/* STEP 2: Product Targeting */}
      {step === 2 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Product Targeting</s-heading>
            <div style={{ color: "#616161", fontSize: "14px" }}>Select which products, collections, or tags will receive this discount.</div>

            <div className="cards-grid">
              {(["PRODUCT", "COLLECTION", "TAG"] as const).map((t) => {
                const labelMap = { PRODUCT: "Specific Products", COLLECTION: "Collections", TAG: "Product Tags" };
                const descMap = {
                  PRODUCT: "Select specific products manually to include in the campaign.",
                  COLLECTION: "Include all products currently in chosen collections.",
                  TAG: "Target products dynamically using specific product tags.",
                };
                return (
                  <button
                    key={t}
                    type="button"
                    className={`selection-card ${targetType === t ? "selected" : ""}`}
                    onClick={() => {
                      setTargetType(t);
                      setSelectedResources([]);
                      setTagsInput("");
                      setErrors({});
                    }}
                  >
                    <div className="selection-card-header">
                      <span style={{ fontSize: "16px", fontWeight: "bold" }}>{t}</span>
                      {targetType === t && <div className="selection-card-check">✓</div>}
                    </div>
                    <div className="selection-card-title">{labelMap[t]}</div>
                    <div className="selection-card-desc">{descMap[t]}</div>
                  </button>
                );
              })}
            </div>

            {targetType === "TAG" ? (
              <s-stack direction="block" gap="small">
                <label className="polaris-label">Product Tags (comma separated)</label>
                <input
                  type="text"
                  className="polaris-input"
                  value={tagsInput}
                  onChange={(e) => {
                    setTagsInput(e.target.value);
                    setErrors((prev) => ({ ...prev, targeting: "" }));
                  }}
                  placeholder="winter-sale, summer-sale, promotion"
                />
                <div className="polaris-helptext font-weight-regular">
                  Products carrying any of these tags will automatically receive the scheduled campaign discounts.
                </div>
                {errors.targeting && <div className="validation-error">{errors.targeting}</div>}
              </s-stack>
            ) : (
              <s-stack direction="block" gap="small">
                <s-button onClick={openPicker} variant="secondary">
                  Select {targetType === "PRODUCT" ? "Products" : "Collections"}
                </s-button>
                {errors.targeting && <div className="validation-error">{errors.targeting}</div>}

                {selectedResources.length > 0 && (
                  <div className="resource-list">
                    {selectedResources.map((r) => {
                      const img = r.images?.[0]?.originalSrc || r.image?.originalSrc || "";
                      return (
                        <div key={r.id} className="resource-item">
                          {img ? (
                            <img className="resource-img" src={img} alt="" />
                          ) : (
                            <div className="resource-img" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#888" }}>
                              No image
                            </div>
                          )}
                          <div className="resource-info">
                            <div className="resource-title">{r.title}</div>
                          </div>
                          <button type="button" className="resource-remove" onClick={() => removeResource(r.id)}>
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </s-stack>
            )}

            <s-stack direction="inline" justify-content="space-between">
              <s-button onClick={handleBackStep}>Back</s-button>
              <s-button variant="primary" onClick={handleNextStep}>
                Next: Discount Stages
              </s-button>
            </s-stack>
          </s-stack>
        </s-grid>
      )}

      {/* STEP 3: Discount Stages */}
      {step === 3 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Discount Stages</s-heading>
            <div style={{ color: "#616161", fontSize: "14px" }}>
              Build sequential discount stages. The start and end dates are calculated automatically from stage durations.
            </div>

            {stages.map((stage, idx) => {
              const dates = stageDates[idx];
              const valError = errors[`stage-${idx}-val`];
              const durError = errors[`stage-${idx}-dur`];

              return (
                <div key={idx} className="stage-card">
                  <div className="stage-header">
                    <div className="stage-title-row">
                      <span className="stage-badge-number">Stage {idx + 1}</span>
                      <s-text font-weight="semibold">{stage.label || `Phase ${idx + 1}`}</s-text>
                    </div>
                    {stages.length > 1 && (
                      <s-button tone="critical" variant="tertiary" onClick={() => removeStage(idx)}>
                        Remove
                      </s-button>
                    )}
                  </div>

                  <div className="stage-card-fields">
                    <s-text-field
                      label="Stage Title / Label"
                      value={stage.label}
                      onChange={(e: any) => updateStage(idx, "label", e.currentTarget.value)}
                      placeholder="e.g. Warm Up, Peak Discount"
                    />

                    <div>
                      <label className="polaris-label">Discount ({discountType === "PERCENTAGE" ? "%" : "$"})</label>
                      <input
                        type="number"
                        className="polaris-input"
                        value={stage.discountValue}
                        onChange={(e) => {
                          updateStage(idx, "discountValue", e.target.value);
                          setErrors((prev) => ({ ...prev, [`stage-${idx}-val`]: "" }));
                        }}
                      />
                      {valError && <div className="validation-error">{valError}</div>}
                    </div>

                    <div>
                      <label className="polaris-label">Duration (Days)</label>
                      <input
                        type="number"
                        className="polaris-input"
                        value={stage.durationDays}
                        onChange={(e) => {
                          updateStage(idx, "durationDays", e.target.value);
                          setErrors((prev) => ({ ...prev, [`stage-${idx}-dur`]: "" }));
                        }}
                      />
                      {durError && <div className="validation-error">{durError}</div>}
                    </div>
                  </div>

                  {dates && (
                    <div className="stage-summary-callout">
                      <span>📅</span>
                      <span>
                        Calculated Run: <strong>{dates.start.toLocaleDateString()}</strong> at{" "}
                        {dates.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} to{" "}
                        <strong>{dates.end.toLocaleDateString()}</strong> at{" "}
                        {dates.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ({stage.durationDays}{" "}
                        days)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            <s-stack direction="inline">
              <s-button onClick={addStage} variant="secondary">
                Add Stage
              </s-button>
            </s-stack>

            <s-stack direction="inline" justify-content="space-between">
              <s-button onClick={handleBackStep}>Back</s-button>
              <s-button variant="primary" onClick={handleNextStep}>
                Next: Review &amp; Launch
              </s-button>
            </s-stack>
          </s-stack>
        </s-grid>
      )}

      {/* STEP 4: Review & Launch */}
      {step === 4 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Review &amp; Launch Campaign</s-heading>
            <div style={{ color: "#616161", fontSize: "14px" }}>Please review your setup details below before activating or saving the campaign.</div>

            <div className="review-grid">
              {/* Overview Details */}
              <div className="review-section">
                <div className="polaris-heading-md">General Setup</div>
                <div style={{ marginTop: "12px" }}>
                  <div className="review-row">
                    <span className="review-row-label">Campaign Name</span>
                    <span className="review-row-value">{name}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-row-label">Discount Type</span>
                    <span className="review-row-value">
                      {discountType === "PERCENTAGE" ? "Percentage (%)" : "Fixed Amount ($)"}
                    </span>
                  </div>
                  <div className="review-row">
                    <span className="review-row-label">Start Date</span>
                    <span className="review-row-value">{new Date(startDateStr).toLocaleString()}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-row-label">Timezone</span>
                    <span className="review-row-value">{timezone}</span>
                  </div>
                  <div className="review-row">
                    <span className="review-row-label">Targeting</span>
                    <span className="review-row-value">
                      {targetType === "TAG"
                        ? `Tags: ${tagsInput}`
                        : `${selectedResources.length} ${targetType.toLowerCase()}(s) selected`}
                    </span>
                  </div>
                  {notes && (
                    <div className="review-row" style={{ flexDirection: "column", gap: "4px" }}>
                      <span className="review-row-label">Notes</span>
                      <span style={{ fontSize: "13px", color: "#616161", lineHeight: "1.4" }}>{notes}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stages Schedule */}
              <div className="review-section">
                <div className="polaris-heading-md">Calculated Schedule</div>
                <div className="timeline-vertical">
                  {stages.map((stage, idx) => {
                    const dates = stageDates[idx];
                    return (
                      <div key={idx} className="timeline-item">
                        <div className="timeline-marker"></div>
                        <div className="timeline-content">
                          <div style={{ fontWeight: "600", color: "#303030" }}>
                            Stage {idx + 1}: {stage.label || `Phase ${idx + 1}`}
                          </div>
                          <div style={{ color: "#008060", fontWeight: "600", fontSize: "13px", marginTop: "2px" }}>
                            Discount: {stage.discountValue}
                            {discountType === "PERCENTAGE" ? "%" : "$"}
                          </div>
                          {dates && (
                            <div style={{ fontSize: "12px", color: "#616161", marginTop: "2px" }}>
                              Runs: {dates.start.toLocaleDateString()} to {dates.end.toLocaleDateString()} ({stage.durationDays} days)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <s-stack direction="inline" justify-content="space-between">
              <s-button onClick={handleBackStep} disabled={isSubmitting}>
                Back
              </s-button>
              <s-stack direction="inline" gap="base">
                <s-button onClick={() => submit("DRAFT")} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </s-button>
                <s-button variant="primary" onClick={() => submit("SCHEDULED")} disabled={isSubmitting}>
                  {isSubmitting ? "Scheduling..." : "Schedule Campaign"}
                </s-button>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-grid>
      )}
    </s-page>
  );
}
