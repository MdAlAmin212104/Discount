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
        shopId: shop.id, name, discountType, timezone, startDate: start, endDate: campaignEnd, notes, status,
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
        shopId: shop.id, campaignId: campaign.id, event: LogEvent.CAMPAIGN_CREATED,
        message: `Campaign "${name}" ${status === "SCHEDULED" ? "scheduled" : "saved as draft"}.`,
      },
    });

    return { success: true, campaignId: campaign.id };
  } catch (error: any) {
    return { error: error.message || "Failed to create campaign" };
  }
};

export default function NewCampaign() {
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIX_AMOUNT">("PERCENTAGE");
  const [timezone, setTimezone] = useState("UTC");
  const [startDateStr, setStartDateStr] = useState(
    new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16)
  );
  const [notes, setNotes] = useState("");
  const [targetType, setTargetType] = useState<"PRODUCT" | "COLLECTION" | "TAG">("PRODUCT");
  const [selectedResources, setSelectedResources] = useState<any[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [stages, setStages] = useState([{ label: "Stage 1", discountValue: "10", durationDays: "3" }]);

  const openPicker = async () => {
    const selected = await (shopify as any).resourcePicker({ type: targetType === "PRODUCT" ? "product" : "collection", multiple: true });
    if (selected?.length) setSelectedResources(selected.map((i: any) => ({ id: i.id, title: i.title })));
  };

  const addStage = () =>
    setStages([...stages, { label: `Stage ${stages.length + 1}`, discountValue: "10", durationDays: "3" }]);

  const updateStage = (i: number, key: string, val: string) => {
    const updated = [...stages];
    updated[i] = { ...updated[i], [key]: val };
    setStages(updated);
  };

  const submit = (status: "DRAFT" | "SCHEDULED") => {
    const products =
      targetType === "TAG"
        ? tagsInput.split(",").map((t) => t.trim()).filter(Boolean).map((tag) => ({ targetType: "TAG", targetValue: tag }))
        : selectedResources.map((r) => ({ targetType, targetValue: r.id }));

    fetch(window.location.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, discountType, timezone, startDateStr, notes, products, stages, status }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) shopify.toast.show(d.error, { isError: true });
        else { shopify.toast.show("Campaign created!"); navigate(`/app/campaigns/${d.campaignId}`); }
      });
  };

  return (
    <s-page title="Create Discount Campaign">
      <s-button slot="back-action" variant="tertiary" onClick={() => navigate("/app/campaigns")}>
        Campaigns
      </s-button>

      {/* Step indicator */}
      <s-grid>
        <s-stack direction="inline" gap="large" justify-content="space-between">
          {["Campaign Info", "Product Targeting", "Discount Stages", "Review & Launch"].map((label, i) => (
            <s-text key={i} font-weight={step === i + 1 ? "bold" : "regular"} tone={step === i + 1 ? "base" : "subdued"}>
              Step {i + 1}: {label}
            </s-text>
          ))}
        </s-stack>
      </s-grid>

      {/* STEP 1 */}
      {step === 1 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Campaign Info</s-heading>

            <s-text-field
              label="Campaign Name"
              value={name}
              onChange={(e: any) => setName(e.currentTarget.value)}
              placeholder="Black Friday Promotion"
            />

            <s-stack direction="block" gap="small">
              <s-text font-weight="semibold">Discount Type</s-text>
              <s-stack direction="inline" gap="base">
                <s-stack direction="inline" gap="small" align-items="center">
                  <input
                    type="radio"
                    id="pct"
                    name="dtype"
                    checked={discountType === "PERCENTAGE"}
                    onChange={() => setDiscountType("PERCENTAGE")}
                  />
                  <label htmlFor="pct"><s-text>Percentage (%)</s-text></label>
                </s-stack>
                <s-stack direction="inline" gap="small" align-items="center">
                  <input
                    type="radio"
                    id="fix"
                    name="dtype"
                    checked={discountType === "FIX_AMOUNT"}
                    onChange={() => setDiscountType("FIX_AMOUNT")}
                  />
                  <label htmlFor="fix"><s-text>Fixed Amount ($)</s-text></label>
                </s-stack>
              </s-stack>
            </s-stack>

            <s-stack direction="inline" gap="base">
              <s-text-field
                label="Start Date and Time"
                type="datetime-local"
                value={startDateStr}
                onChange={(e: any) => setStartDateStr(e.currentTarget.value)}
              />
              <s-select
                label="Timezone"
                value={timezone}
                onChange={(e: any) => setTimezone(e.currentTarget.value)}
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">EST / New York</option>
                <option value="America/Los_Angeles">PST / Los Angeles</option>
                <option value="Europe/London">GMT / London</option>
              </s-select>
            </s-stack>

            <s-text-field
              label="Notes (Optional)"
              multiline="3"
              value={notes}
              onChange={(e: any) => setNotes(e.currentTarget.value)}
            />

            <s-stack direction="inline" justify-content="end">
              <s-button variant="primary" onClick={() => setStep(2)} disabled={!name}>
                Next: Targeting
              </s-button>
            </s-stack>
          </s-stack>
        </s-grid>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Product Targeting</s-heading>

            <s-stack direction="block" gap="small">
              <s-text font-weight="semibold">Target Type</s-text>
              <s-stack direction="inline" gap="base">
                {(["PRODUCT", "COLLECTION", "TAG"] as const).map((t) => (
                  <s-stack key={t} direction="inline" gap="small" align-items="center">
                    <input
                      type="radio"
                      id={`ttype-${t}`}
                      name="targetType"
                      checked={targetType === t}
                      onChange={() => { setTargetType(t); setSelectedResources([]); }}
                    />
                    <label htmlFor={`ttype-${t}`}><s-text>{t.charAt(0) + t.slice(1).toLowerCase()}</s-text></label>
                  </s-stack>
                ))}
              </s-stack>
            </s-stack>

            {targetType === "TAG" ? (
              <s-text-field
                label="Tags (comma separated)"
                value={tagsInput}
                onChange={(e: any) => setTagsInput(e.currentTarget.value)}
                placeholder="sale, winter, promo"
                helpText="App applies discounts to all products with any of these tags."
              />
            ) : (
              <s-stack direction="block" gap="small">
                <s-button onClick={openPicker}>
                  Select {targetType === "PRODUCT" ? "Products" : "Collections"}
                </s-button>
                {selectedResources.length > 0 && (
                  <s-stack direction="inline" gap="small">
                    {selectedResources.map((r) => (
                      <s-badge key={r.id}>{r.title}</s-badge>
                    ))}
                  </s-stack>
                )}
              </s-stack>
            )}

            <s-stack direction="inline" justify-content="space-between">
              <s-button onClick={() => setStep(1)}>Back</s-button>
              <s-button
                variant="primary"
                onClick={() => setStep(3)}
                disabled={targetType === "TAG" ? !tagsInput : selectedResources.length === 0}
              >
                Next: Stages
              </s-button>
            </s-stack>
          </s-stack>
        </s-grid>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Discount Stages</s-heading>
            <s-text tone="subdued">Build sequential stages. Dates are auto-calculated from duration.</s-text>

            {stages.map((stage, idx) => {
              let daysOffset = 0;
              for (let i = 0; i < idx; i++) daysOffset += parseInt(stages[i].durationDays || "0");
              const start = new Date(startDateStr);
              start.setDate(start.getDate() + daysOffset);
              const end = new Date(start);
              end.setDate(end.getDate() + parseInt(stage.durationDays || "0"));

              return (
                <s-grid key={idx}>
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" justify-content="space-between" align-items="center">
                      <s-heading>Stage {idx + 1}</s-heading>
                      {stages.length > 1 && (
                        <s-button tone="critical" onClick={() => setStages(stages.filter((_, i) => i !== idx))}>
                          Remove
                        </s-button>
                      )}
                    </s-stack>

                    <s-stack direction="inline" gap="base">
                      <s-text-field
                        label="Label (Optional)"
                        value={stage.label}
                        onChange={(e: any) => updateStage(idx, "label", e.currentTarget.value)}
                        placeholder="Phase 1: Warm Up"
                      />
                      <s-text-field
                        label={`Discount (${discountType === "PERCENTAGE" ? "%" : "$"})`}
                        type="number"
                        value={stage.discountValue}
                        onChange={(e: any) => updateStage(idx, "discountValue", e.currentTarget.value)}
                      />
                      <s-text-field
                        label="Duration (days)"
                        type="number"
                        value={stage.durationDays}
                        onChange={(e: any) => updateStage(idx, "durationDays", e.currentTarget.value)}
                      />
                    </s-stack>

                    <s-text tone="subdued" variant="bodySm">
                      📅 {start.toLocaleDateString()} → {end.toLocaleDateString()} ({stage.durationDays} days)
                    </s-text>
                  </s-stack>
                </s-grid>
              );
            })}

            <s-button onClick={addStage} icon="PlusCircleIcon">Add Stage</s-button>

            <s-stack direction="inline" justify-content="space-between">
              <s-button onClick={() => setStep(2)}>Back</s-button>
              <s-button variant="primary" onClick={() => setStep(4)}>Next: Review</s-button>
            </s-stack>
          </s-stack>
        </s-grid>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Review &amp; Launch Campaign</s-heading>

            <s-grid>
              <s-stack direction="block" gap="base">
                <s-heading>Summary</s-heading>
                {[
                  ["Name", name],
                  ["Type", discountType === "PERCENTAGE" ? "Percentage" : "Fixed Amount"],
                  ["Start", new Date(startDateStr).toLocaleString()],
                  ["Stages", `${stages.length} stages`],
                  ["Targeting", targetType === "TAG" ? `Tags: ${tagsInput}` : `${selectedResources.length} ${targetType.toLowerCase()}(s)`],
                ].map(([label, value]) => (
                  <s-stack key={label} direction="inline" justify-content="space-between">
                    <s-text font-weight="semibold">{label}</s-text>
                    <s-text>{value}</s-text>
                  </s-stack>
                ))}
                {notes && (
                  <s-stack direction="block" gap="none">
                    <s-text font-weight="semibold">Notes</s-text>
                    <s-text tone="subdued">{notes}</s-text>
                  </s-stack>
                )}
              </s-stack>
            </s-grid>

            <s-stack direction="inline" justify-content="space-between">
              <s-button onClick={() => setStep(3)}>Back</s-button>
              <s-stack direction="inline" gap="base">
                <s-button onClick={() => submit("DRAFT")}>Save as Draft</s-button>
                <s-button variant="primary" onClick={() => submit("SCHEDULED")}>Schedule Campaign</s-button>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-grid>
      )}
    </s-page>
  );
}
