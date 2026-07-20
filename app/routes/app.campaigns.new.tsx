import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useActionData, useNavigate, useFetcher, useRevalidator, useNavigation } from "react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import { CampaignStatus } from "@prisma/client";
import { processStageJob } from "../services/scheduler.server";

interface Phase {
  phaseTitle: string;
  badgeLabel: string;
  discountValue: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  isSaved: boolean;
}

// 30-min interval time options
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const totalMinutes = i * 30;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const period = hours < 12 ? "AM" : "PM";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const label = `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
  return { value, label };
});

function getTimezoneOffset(ianaTimezone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      timeZoneName: "longOffset",
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (tzPart) {
      const val = tzPart.value;
      if (val === "GMT") return "+00:00";
      const offset = val.replace("GMT", "");
      const match = offset.match(/^([+-])(\d+)(?::(\d+))?$/);
      if (match) {
        const sign = match[1];
        const hours = match[2].padStart(2, "0");
        const minutes = (match[3] || "00").padStart(2, "0");
        return `${sign}${hours}:${minutes}`;
      }
    }
  } catch (e) {
    console.error("getTimezoneOffset error:", e);
  }
  return "+00:00";
}

function getCurrentTimeInTz(ianaTimezone: string): { date: string; time: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  const year = get("year"), month = get("month"), day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hour}:${minute}`;
  return { date: dateStr, time: timeStr };
}

function getSelectOptionsWithDefault(defaultValue: string) {
  const exists = TIME_OPTIONS.some((opt) => opt.value === defaultValue);
  if (exists || !defaultValue) return TIME_OPTIONS;

  const [hours, minutes] = defaultValue.split(":").map(Number);
  const period = hours < 12 ? "AM" : "PM";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const label = `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period} (Current)`;
  
  const customOption = { value: defaultValue, label };
  const result = [...TIME_OPTIONS, customOption];
  result.sort((a, b) => {
    const [hA, mA] = a.value.split(":").map(Number);
    const [hB, mB] = b.value.split(":").map(Number);
    return (hA * 60 + mA) - (hB * 60 + mB);
  });
  return result;
}

function addMinutesToTime(dateStr: string, timeStr: string, minutesToAdd: number): { date: string; time: string } {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  const dayOverflow = Math.floor(totalMinutes / (24 * 60));
  let newDate = dateStr;
  if (dayOverflow > 0) {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + dayOverflow);
    newDate = d.toISOString().split("T")[0];
  }
  return {
    date: newDate,
    time: `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`,
  };
}

const createEmptyPhase = (
  stageNumber: number,
  timezone: string = "UTC",
  prevEnd?: { date: string; time: string }
): Phase => {
  let startDate: string, startTime: string;
  if (prevEnd && prevEnd.date) {
    startDate = prevEnd.date;
    startTime = prevEnd.time;
  } else {
    const current = getCurrentTimeInTz(timezone);
    startDate = current.date;
    startTime = current.time;
  }
  const endResult = addMinutesToTime(startDate, startTime, 24 * 60);
  return {
    phaseTitle: `Phase ${stageNumber} Title`,
    badgeLabel: `Drop ${stageNumber} — open now`,
    discountValue: "10",
    startDate,
    startTime,
    endDate: endResult.date,
    endTime: endResult.time,
    isSaved: false,
  };
};

// ── useWebComponentChoice: robust listener for s-choice-list ──
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

      // 1. Try to read values array from s-choice-list (currentTarget or el)
      const values = targetList?.values ?? targetEl?.values;
      if (Array.isArray(values) && values.length > 0) {
        onChangeRef.current(values[0]);
        return;
      }

      // 2. Fallbacks: detail, target element value, list value
      const val =
        ce.detail?.value ??
        targetEl?.value ??
        targetList?.value;

      if (val) {
        onChangeRef.current(val);
      }
    };

    // listen on both the component and bubbled change from children
    el.addEventListener("change", handler);
    el.addEventListener("s-change", handler);
    return () => {
      el.removeEventListener("change", handler);
      el.removeEventListener("s-change", handler);
    };
  }, [ref]);
}

// ── useWebComponentAttr: imperatively set attrs so web components see the update ──
function useWebComponentAttr(
  ref: React.RefObject<HTMLElement | null>,
  attr: string,
  value: string
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute(attr, value);
  }, [ref, attr, value]);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const url = new URL(request.url);
  const actionType = url.searchParams.get("action");
  const collectionId = url.searchParams.get("collectionId");
  const tag = url.searchParams.get("tag");
  const campaignId = url.searchParams.get("id");

  const responseShop = await admin.graphql(`#graphql
    query getShopSettings {
      shop { ianaTimezone currencyCode }
    }`);
  const shopJson = await responseShop.json();
  const shopData = shopJson.data?.shop || { ianaTimezone: "UTC", currencyCode: "USD" };
  const offset = getTimezoneOffset(shopData.ianaTimezone);
  const shopSettings = { timezone: shopData.ianaTimezone, currency: shopData.currencyCode, offset };

  const productIdsParam = url.searchParams.get("productIds");
  if (actionType === "resolve-products" && productIdsParam) {
    const ids = productIdsParam.split(",").filter(Boolean);
    if (ids.length) {
      const res = await admin.graphql(`#graphql
        query getProductsWithVariants($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              variants(first: 250) {
                nodes {
                  id
                  title
                }
              }
            }
          }
        }`, { variables: { ids } });
      const json = await res.json();
      const products = (json.data?.nodes || []).filter(Boolean);
      return { products, resolvedProductsForIds: true, shopSettings };
    }
  }

  if (actionType === "resolve-collection" && collectionId) {
    const response = await admin.graphql(`#graphql
      query getCollectionProducts($id: ID!) {
        collection(id: $id) {
          products(first: 100) {
            nodes { id title handle featuredImage { url } tags }
          }
        }
      }`, { variables: { id: collectionId } });
    const resJson = await response.json();
    return { products: resJson.data?.collection?.products?.nodes || [], resolvedCollectionId: collectionId, shopSettings };
  }

  if (actionType === "resolve-tag" && tag) {
    const response = await admin.graphql(`#graphql
      query getProductsByTag($query: String!) {
        products(first: 100, query: $query) {
          nodes { id title handle featuredImage { url } tags }
        }
      }`, { variables: { query: `tag:${tag}` } });
    const resJson = await response.json();
    return { products: resJson.data?.products?.nodes || [], resolvedTag: tag, shopSettings };
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, shopId: shop.id },
      include: { stages: { orderBy: { stageNumber: "asc" } }, products: true },
    });
    if (!campaign) throw new Response("Campaign not found", { status: 404 });

    let resolvedProducts: any[] = [];
    let loadedCollections: any[] = [];
    let loadedVariants: any[] = [];
    let resolvedCollectionsMap: Record<string, any[]> = {};

    for (const prodTarget of campaign.products) {
      if (prodTarget.targetType === "PRODUCT") {
        // For each product, fetch all its variants so the UI can show variant-level selection
        const productIds = prodTarget.targetValue.split(",").filter(Boolean);
        if (productIds.length) {
          const res = await admin.graphql(`#graphql
            query getProductsWithVariants($ids: [ID!]!) {
              nodes(ids: $ids) {
                ... on Product {
                  id title handle
                  featuredImage { url }
                  variants(first: 100) {
                    nodes { id title price }
                  }
                }
              }
            }`, { variables: { ids: productIds } });
          const json = await res.json();
          const products = (json.data?.nodes || []).filter(Boolean);
          resolvedProducts.push(...products);
          // Expand to individual variants for the variant-based display
          for (const product of products) {
            for (const variant of (product.variants?.nodes || [])) {
              loadedVariants.push({
                id: variant.id,
                title: variant.title,
                price: parseFloat(variant.price || "0"),
                productTitle: product.title,
                productHandle: product.handle,
                productId: product.id,
                featuredImage: { url: product.featuredImage?.url || "" },
              });
            }
          }
        }
      } else if (prodTarget.targetType === "COLLECTION") {
        const ids = prodTarget.targetValue.split(",").filter(Boolean);
        if (ids.length) {
          const resCol = await admin.graphql(`#graphql
            query getCollectionsDetails($ids: [ID!]!) {
              nodes(ids: $ids) { ... on Collection { id title } }
            }`, { variables: { ids } });
          loadedCollections = (await resCol.json()).data?.nodes?.filter(Boolean) || [];
          for (const colId of ids) {
            const res = await admin.graphql(`#graphql
              query getCollectionProducts($id: ID!) {
                collection(id: $id) {
                  products(first: 100) { nodes { id title handle featuredImage { url } tags } }
                }
              }`, { variables: { id: colId } });
            const colProds = (await res.json()).data?.collection?.products?.nodes || [];
            resolvedProducts.push(...colProds);
            resolvedCollectionsMap[colId] = colProds;
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
      } else if ((prodTarget.targetType as string) === "VARIANT") {
        const ids = prodTarget.targetValue.split(",").filter(Boolean);
        if (ids.length) {
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
                    handle
                    featuredImage { url }
                  }
                }
              }
            }`, { variables: { ids } });
          const json = await res.json();
          const nodes = (json.data?.nodes || []).filter(Boolean);
          const loadedVariants = nodes.map((v: any) => ({
            id: v.id,
            title: v.title,
            price: parseFloat(v.price || "0"),
            productTitle: v.product?.title || "",
            productHandle: v.product?.handle || "",
            productId: v.product?.id || "",
            featuredImage: { url: v.product?.featuredImage?.url || "" },
          }));
          return { campaign, resolvedProducts: [], loadedCollections: [], resolvedCollectionsMap: {}, loadedVariants, shopSettings };
        }
      }
    }

    const seen = new Set();
    const deduplicatedProducts = resolvedProducts.filter((p) => {
      if (!p || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return { campaign, resolvedProducts: deduplicatedProducts, loadedCollections, resolvedCollectionsMap, loadedVariants: [], shopSettings };
  }

  return { campaign: null, resolvedProducts: [], loadedCollections: [], resolvedCollectionsMap: {}, loadedVariants: [], shopSettings };
};

// ── Helper: resolve products for a comma-separated list of tags ──
async function resolveTagProductIds(admin: any, tags: string[]): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (!tag) continue;
    const res = await admin.graphql(`#graphql
      query getProductsByTag($query: String!) {
        products(first: 250, query: $query) { nodes { id } }
      }`, { variables: { query: `tag:${tag}` } });
    const json = await res.json();
    const nodes = json.data?.products?.nodes || [];
    for (const n of nodes) {
      if (!seen.has(n.id)) { seen.add(n.id); ids.push(n.id); }
    }
  }
  return ids;
}

// ── Helper: build the `items` input for customerGets based on target type ──
async function buildDiscountItemsInput(
  admin: any,
  targetType: string,
  targetValue: string
): Promise<any> {
  const ids = (targetValue || "").split(",").filter(Boolean);

  if (targetType === "PRODUCT") {
    return { products: { productsToAdd: ids } };
  }
  if (targetType === "COLLECTION") {
    return { collections: { add: ids } };
  }
  // TAG: Shopify discount targeting doesn't support tags directly,
  // so resolve matching product IDs and target those instead.
  const resolvedIds = await resolveTagProductIds(admin, ids);
  return { products: { productsToAdd: resolvedIds } };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");
  const formData = await request.formData();

  const id = formData.get("id") as string | null;
  const name = formData.get("name") as string;
  const discountType = formData.get("discountType") as string;
  const targetType = formData.get("targetType") as string;
  const targetValue = formData.get("targetValue") as string;
  const stagesDataRaw = formData.get("stages") as string;

  if (!name) return { error: "Campaign name is required" };

  let stagesData: any[] = [];
  try { stagesData = stagesDataRaw ? JSON.parse(stagesDataRaw) : []; }
  catch (e) { return { error: "Invalid stages format" }; }

  if (stagesData.length === 0) {
    const todayStr = new Date().toISOString().split("T")[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    stagesData = [{
      phaseTitle: "Phase 1 Title", badgeLabel: "Drop 1 — open now", discountValue: 10,
      startDate: `${todayStr}T00:00:00Z`, endDate: `${tomorrowStr}T00:00:00Z`,
    }];
  }

  if (!targetType || !targetValue) {
    return { error: "Please select at least one product, collection, or tag" };
  }

  const startDates = stagesData.map((s) => new Date(s.startDate));
  const endDates = stagesData.map((s) => new Date(s.endDate));
  const campaignStartDate = new Date(Math.min(...startDates.map((d) => d.getTime())));
  const campaignEndDate = new Date(Math.max(...endDates.map((d) => d.getTime())));
  const now = new Date();
  let status: CampaignStatus = CampaignStatus.SCHEDULED;
  if (campaignEndDate <= now) status = CampaignStatus.COMPLETED;
  else if (campaignStartDate <= now && campaignEndDate > now) status = CampaignStatus.ACTIVE;

  // ── Resolve the discount `items` target ONCE — same target applies to every phase ──
  let itemsInput: any;
  try {
    itemsInput = await buildDiscountItemsInput(admin, targetType, targetValue);
  } catch (resolveErr) {
    console.error("Error resolving discount target items:", resolveErr);
    return { error: "Failed to resolve selected products/collections/tags" };
  }

  // ── Grab existing stages' Shopify discount IDs BEFORE wiping them out (edit mode only) ──
  let existingStagesWithDiscount: { stageNumber: number; shopifyDiscountId: string | null }[] = [];
  if (id) {
    existingStagesWithDiscount = await prisma.campaignStage.findMany({
      where: { campaignId: id },
      select: { stageNumber: true, shopifyDiscountId: true },
      orderBy: { stageNumber: "asc" },
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let campaign;
      if (id) {
        const existingStages = await tx.campaignStage.findMany({ where: { campaignId: id }, select: { id: true } });
        const stageIds = existingStages.map((s) => s.id);
        await tx.schedulerJob.deleteMany({ where: { stageId: { in: stageIds } } });
        await tx.campaignStage.deleteMany({ where: { campaignId: id } });
        await tx.campaignProduct.deleteMany({ where: { campaignId: id } });
        campaign = await tx.campaign.update({
          where: { id },
          data: { name, discountType: (discountType || "PERCENTAGE") as any, startDate: campaignStartDate, endDate: campaignEndDate, status },
        });
      } else {
        campaign = await tx.campaign.create({
          data: { shopId: shop.id, name, discountType: (discountType || "PERCENTAGE") as any, startDate: campaignStartDate, endDate: campaignEndDate, status },
        });
      }
      await tx.campaignProduct.create({
        data: { campaignId: campaign.id, targetType: (targetType || "PRODUCT") as any, targetValue: targetValue || "" },
      });

      const createdStages = [];
      for (let i = 0; i < stagesData.length; i++) {
        const s = stagesData[i];
        const code = `${name.replace(/\s+/g, "_").toUpperCase()}_PHASE_${i + 1}_${campaign.id.slice(-4)}`;
        const labelObj = {
          label: s.badgeLabel, isCirclePhase: true, phaseTitle: s.phaseTitle,
        };
        const stage = await tx.campaignStage.create({
          data: {
            campaignId: campaign.id, stageNumber: i + 1,
            label: JSON.stringify(labelObj), discountValue: parseFloat(s.discountValue),
            startDate: new Date(s.startDate), endDate: new Date(s.endDate), status: "PENDING",
          },
        });
        let job = null;
        if (new Date(s.endDate) > now) {
          const scheduledAt = new Date(s.startDate) <= now ? now : new Date(s.startDate);
          job = await tx.schedulerJob.create({ data: { shopId: shop.id, stageId: stage.id, scheduledAt, status: "PENDING" } });
        }

        const matchedOld = existingStagesWithDiscount.find(
          (es) => es.stageNumber === i + 1 && !!es.shopifyDiscountId
        );

        createdStages.push({ stage, code, job, oldShopifyDiscountId: matchedOld?.shopifyDiscountId || null });
      }
      return { campaign, createdStages };
    });

    const { campaign, createdStages } = result;

    // ── Trigger immediate price updates for any stage that's active right now ──
    for (const item of createdStages) {
      const s = item.stage;
      const job = item.job;
      if (job && new Date(s.startDate) <= now && new Date(s.endDate) >= now) {
        processStageJob(job).catch((err) => {
          console.error("Error triggering immediate price update for stage job:", err);
        });
      }
    }

    return { success: true, campaign };
  } catch (err: any) {
    return { error: err.message || "Failed to save campaign" };
  }
};

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

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function AdditionalPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const actionFetcher = useFetcher();
  const revalidator = useRevalidator();
  const navigation = useNavigation();

  const isSaving = navigation.state !== "idle" && navigation.formMethod === "POST";

  const campaign = (loaderData as any)?.campaign || null;
  const campaignId = campaign?.id || null;
  const storeTimezone = (loaderData as any)?.shopSettings?.timezone || "UTC";
  const offset = (loaderData as any)?.shopSettings?.offset || "+00:00";
  const currency = (loaderData as any)?.shopSettings?.currency || "USD";

  const visibleStyle = { style: { overflow: "visible" } } as any;

  // ── State ──
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed" | "fixed_discount">("percentage");
  const [productOption, setProductOption] = useState<"products" | "collections" | "tags">("products");

  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<any[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<any[]>([]);
  const [collectionProductsMap, setCollectionProductsMap] = useState<Record<string, any[]>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagProducts, setTagProducts] = useState<any[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagLoading, setTagLoading] = useState(false);
  const [productTotalVariantsMap, setProductTotalVariantsMap] = useState<Record<string, { id: string; title: string }[]>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [phases, setPhases] = useState<Phase[]>([createEmptyPhase(1, storeTimezone)]);

  const getCampaignInitialValues = useCallback(() => {
    const ld = loaderData as any;
    if (!ld?.campaign) {
      return {
        name: "",
        discountType: "percentage" as const,
        productOption: "products" as const,
        selectedProducts: [],
        selectedCollections: [],
        selectedVariants: [],
        collectionProductsMap: {},
        selectedTags: [],
        tagProducts: [],
        phases: [createEmptyPhase(1, storeTimezone)],
      };
    }
    const c = ld.campaign;
    let dt: "percentage" | "fixed" | "fixed_discount" = "percentage";
    if (c.discountType === "PERCENTAGE") {
      dt = "percentage";
    } else if (c.discountType === "FIX_AMOUNT") {
      dt = "fixed";
    } else if (c.discountType === "FIXED_DISCOUNT") {
      dt = "fixed_discount";
    }

    const firstProduct = c.products[0];
    // Both PRODUCT and VARIANT targetType use "products" option now (variant-level granularity)
    const opt: "products" | "collections" | "tags" =
      (firstProduct?.targetType === "PRODUCT" || (firstProduct?.targetType as string) === "VARIANT") ? "products"
      : firstProduct?.targetType === "COLLECTION" ? "collections"
      : "tags";

    let selProds: any[] = [];
    let selCols: any[] = [];
    let selTags: any[] = [];
    let tProds: any[] = [];
    let colProdsMap: Record<string, any[]> = {};
    let selVars: any[] = [];

    if (opt === "products") {
      // Always use variant-level state for "Specific Products" mode
      selVars = ld.loadedVariants || [];
    } else if (opt === "collections") {
      selCols = ld.loadedCollections || [];
      colProdsMap = ld.resolvedCollectionsMap || {};
    } else {
      selTags = firstProduct?.targetValue?.split(",") || [];
      tProds = ld.resolvedProducts || [];
    }

    let stagePhases = [createEmptyPhase(1, storeTimezone)];
    if (c.stages?.length) {
      const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-CA", {
        timeZone: storeTimezone, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(d);
      const fmtTime = (d: Date) => {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: storeTimezone, hour: "2-digit", minute: "2-digit", hour12: false,
        }).formatToParts(d);
        const h = parseInt(parts.find(p => p.type === "hour")?.value || "0");
        const m = parseInt(parts.find(p => p.type === "minute")?.value || "0");
        const total = Math.round((h * 60 + m) / 30) * 30;
        const rh = Math.floor(total / 60) % 24;
        const rm = total % 60;
        return `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
      };
      stagePhases = c.stages.map((stage: any) => {
        let labelObj: any = {};
        try { labelObj = JSON.parse(stage.label || "{}"); } catch { }
        return {
          phaseTitle: labelObj.phaseTitle || `Stage ${stage.stageNumber}`,
          badgeLabel: labelObj.label || stage.label || "",
          discountValue: stage.discountValue.toString(),
          startDate: fmtDate(new Date(stage.startDate)),
          startTime: fmtTime(new Date(stage.startDate)),
          endDate: fmtDate(new Date(stage.endDate)),
          endTime: fmtTime(new Date(stage.endDate)),
          isSaved: true,
        };
      });
    }

    return {
      name: c.name,
      discountType: dt,
      productOption: opt,
      selectedProducts: selProds,
      selectedCollections: selCols,
      selectedVariants: selVars,
      collectionProductsMap: colProdsMap,
      selectedTags: selTags,
      tagProducts: tProds,
      phases: stagePhases,
    };
  }, [loaderData, storeTimezone]);

  const initialValuesRef = useRef<any>(null);

  // ── Edit mode init ──
  useEffect(() => {
    const initial = getCampaignInitialValues();
    initialValuesRef.current = initial;

    setName(initial.name);
    setDiscountType(initial.discountType);
    setProductOption(initial.productOption);
    setSelectedProducts(initial.selectedProducts);
    setSelectedCollections(initial.selectedCollections);
    setSelectedVariants(initial.selectedVariants || []);
    setCollectionProductsMap(initial.collectionProductsMap);
    setSelectedTags(initial.selectedTags);
    setTagProducts(initial.tagProducts);
    setPhases(initial.phases);
  }, [getCampaignInitialValues]);

  // Initialize productTotalVariantsMap from loaderData
  useEffect(() => {
    const ld = loaderData as any;
    if (ld?.resolvedProducts) {
      const map: Record<string, { id: string; title: string }[]> = {};
      for (const p of ld.resolvedProducts) {
        if (p.variants?.nodes) {
          map[p.id] = p.variants.nodes.map((v: any) => ({ id: v.id, title: v.title }));
        }
      }
      setProductTotalVariantsMap((prev) => ({ ...prev, ...map }));
    }
  }, [loaderData]);

  // ── Refs for s-* web component listeners ──
  const discountChoiceRef = useRef<any>(null);
  const productChoiceRef = useRef<any>(null);

  // Keep latest discountType & productOption accessible inside event handlers
  const discountTypeRef = useRef(discountType);
  const productOptionRef = useRef(productOption);
  useEffect(() => { discountTypeRef.current = discountType; }, [discountType]);
  useEffect(() => { productOptionRef.current = productOption; }, [productOption]);

  // ── Wire s-choice-list via native DOM events ──
  useWebComponentChoice(discountChoiceRef, (val) => {
    setDiscountType(val as "percentage" | "fixed" | "fixed_discount");
  });
  useWebComponentChoice(productChoiceRef, (val) => {
    const newVal = val as "products" | "collections" | "tags";
    setProductOption(newVal);
    setCurrentPage(1);
    setSearchQuery("");
    // Clear variant selections when switching away from products mode
    if (newVal !== "products") setSelectedVariants([]);
  });

  // ── Imperatively keep s-choice selected attr in sync (controlled) ──
  // s-choice doesn't re-render from React props reliably; set via DOM after state changes
  useEffect(() => {
    const list = productChoiceRef.current;
    if (!list) return;
    (list as any).values = [productOption];
    const choices = list.querySelectorAll("s-choice");
    choices.forEach((c: any) => {
      const val = c.getAttribute("value");
      if (val === productOption) {
        c.setAttribute("selected", "");
        (c as any).selected = true;
      } else {
        c.removeAttribute("selected");
        (c as any).selected = false;
      }
    });
  }, [productOption]);

  useEffect(() => {
    const list = discountChoiceRef.current;
    if (!list) return;
    (list as any).values = [discountType];
    const choices = list.querySelectorAll("s-choice");
    choices.forEach((c: any) => {
      const val = c.getAttribute("value");
      if (val === discountType) {
        c.setAttribute("selected", "");
        (c as any).selected = true;
      } else {
        c.removeAttribute("selected");
        (c as any).selected = false;
      }
    });
  }, [discountType]);

  // ── Also imperatively update s-number-field suffix & label when discountType changes ──
  // Because s-* WC don't reliably pick up React prop changes on suffix/label
  const numberFieldRefs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    numberFieldRefs.current.forEach((el) => {
      if (!el) return;
      if (discountType === "percentage") {
        el.setAttribute("label", "Discount percent");
        el.setAttribute("suffix", "%");
        el.setAttribute("max", "100");
      } else if (discountType === "fixed_discount") {
        el.setAttribute("label", "Discount amount (Off)");
        el.setAttribute("suffix", currency);
        el.removeAttribute("max");
      } else {
        el.setAttribute("label", "Target price amount");
        el.setAttribute("suffix", currency);
        el.removeAttribute("max");
      }
    });
  }, [discountType, currency]);

  // ── Fetcher: collection/tag resolution ──
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const data: any = fetcher.data;
      setTagLoading(false);
      if (data.resolvedTag) {
        setTagProducts((prev) => {
          const combined = [...prev, ...(data.products || [])];
          const seen = new Set();
          return combined.filter((p: any) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
        });
      } else if (data.resolvedCollectionId) {
        setCollectionProductsMap((prev) => ({ ...prev, [data.resolvedCollectionId]: data.products || [] }));
      } else if (data.resolvedProductsForIds && data.products) {
        const map: Record<string, { id: string; title: string }[]> = {};
        for (const p of data.products) {
          if (p.variants?.nodes) {
            map[p.id] = p.variants.nodes.map((v: any) => ({ id: v.id, title: v.title }));
          }
        }
        setProductTotalVariantsMap((prev) => ({ ...prev, ...map }));
      }
    }
  }, [fetcher.data, fetcher.state]);

  // ── Action result ──
  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("Campaign saved successfully");
      navigate("/app/campaigns");
    } else if (actionData?.error) {
      shopify.toast.show((actionData as any).error, { isError: true });
    }
  }, [actionData]);

  // ── Action Fetcher result (Pause/Resume) ──
  useEffect(() => {
    if (actionFetcher.data && actionFetcher.state === "idle") {
      const data = actionFetcher.data as any;
      if (data.success) {
        shopify.toast.show("Campaign status updated successfully");
        revalidator.revalidate();
      } else if (data.error) {
        shopify.toast.show(data.error, { isError: true });
      }
    }
  }, [actionFetcher.data, actionFetcher.state]);

  // ── Browse (products / collections / variants) ──
  const handleBrowse = async () => {
    try {
      if (productOptionRef.current === "products") {
        // Construct selectionIds based on current selectedVariants grouped by productId
        const productMap: Record<string, { id: string; variants: { id: string }[] }> = {};
        for (const variant of selectedVariants) {
          if (!variant.productId) continue;
          if (!productMap[variant.productId]) {
            productMap[variant.productId] = {
              id: variant.productId,
              variants: [],
            };
          }
          productMap[variant.productId].variants.push({ id: variant.id });
        }
        const selectionIds = Object.values(productMap);

        // Use variant-aware picker so merchants can select specific variants per product
        const selected = await shopify.resourcePicker({
          type: "product",
          multiple: true,
          filter: { variants: true },
          selectionIds
        });
        if (selected) {
          // ── Merge logic: keep variants from untouched products ──────────────
          const returnedProductIds = new Set((selected as any[]).map((p: any) => p.id));
          const keptVariants = selectedVariants.filter(
            (v: any) => !returnedProductIds.has(v.productId)
          );
          const newVariants: any[] = [];
          for (const product of selected as any[]) {
            for (const v of (product.variants || [])) {
              newVariants.push({
                id: v.id,
                title: v.title,
                price: parseFloat(v.price || "0"),
                productTitle: product.title || "",
                productHandle: product.handle || "",
                productId: product.id || "",
                featuredImage: { url: product.images?.[0]?.url || v.image?.url || "" },
              });
            }
          }
          setSelectedVariants([...keptVariants, ...newVariants]);

          const missingIds = Array.from(returnedProductIds).filter((id) => !productTotalVariantsMap[id]);
          if (missingIds.length > 0) {
            fetcher.load(`/app/campaigns/new?action=resolve-products&productIds=${encodeURIComponent(missingIds.join(","))}`);
          }
        }
      } else if (productOptionRef.current === "collections") {
        const selectionIds = selectedCollections.map((c: any) => ({ id: c.id }));
        const selected = await shopify.resourcePicker({
          type: "collection",
          multiple: true,
          selectionIds,
        });
        if (selected) {
          const mapped = selected.map((c: any) => ({ id: c.id, title: c.title }));
          setSelectedCollections(mapped);
          for (const col of mapped) {
            if (!collectionProductsMap[col.id]) {
              fetcher.load(`/app/campaigns/new?action=resolve-collection&collectionId=${encodeURIComponent(col.id)}`);
            }
          }
        }
      }
    } catch (err) { console.error(err); }
  };

  // ── Tag add ──
  const handleAddTag = (e?: any) => {
    e?.preventDefault();
    const tag = tagInput.trim();
    if (!tag) return;
    if (selectedTags.includes(tag)) {
      shopify.toast.show("Tag already added");
      setTagInput("");
      return;
    }
    setSelectedTags((prev) => [...prev, tag]);
    setTagInput("");
    setTagLoading(true);
    fetcher.load(`/app/campaigns/new?action=resolve-tag&tag=${encodeURIComponent(tag)}`);
  };

  const handleRemoveProduct = (id: string) => setSelectedProducts((p) => p.filter((x) => x.id !== id));
  // Remove all variants belonging to a product (used in "products" mode grouped table)
  const handleRemoveProductVariants = (productId: string) =>
    setSelectedVariants((v) => v.filter((x) => x.productId !== productId));
  const handleRemoveVariant = (id: string) => setSelectedVariants((v) => v.filter((x) => x.id !== id));
  const handleRemoveCollection = (id: string) => {
    setSelectedCollections((p) => p.filter((c) => c.id !== id));
    setCollectionProductsMap((prev) => { const n = { ...prev }; delete n[id]; delete n["all"]; return n; });
  };
  const handleRemoveTag = (tagVal: string) => {
    const next = selectedTags.filter((t) => t !== tagVal);
    setSelectedTags(next);
    setTagProducts((prev) => prev.filter((p) =>
      p.tags?.some((t: string) => next.some((nt) => nt.toLowerCase() === t.toLowerCase()))
    ));
  };

  // ── Active product list ──
  const activeProducts = (() => {
    if (productOption === "products") {
      // Group selectedVariants by product → one display row per product
      const groups = new Map<string, { id: string; title: string; featuredImage: any; variantNames: string[]; variantIds: string[] }>();
      for (const v of selectedVariants) {
        if (!groups.has(v.productId)) {
          groups.set(v.productId, {
            id: v.productId,
            title: v.productTitle || "Product",
            featuredImage: v.featuredImage,
            variantNames: [],
            variantIds: [],
          });
        }
        const g = groups.get(v.productId)!;
        g.variantNames.push(v.title);
        g.variantIds.push(v.id);
      }
      return Array.from(groups.values());
    }
    if (productOption === "collections") {
      const prods: any[] = [];
      const seen = new Set();
      selectedCollections.forEach((col) => {
        const list = collectionProductsMap[col.id] || [];
        list.forEach((p) => {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            prods.push(p);
          }
        });
      });
      return prods;
    }
    return tagProducts;
  })();

  const filteredProducts = activeProducts.filter((p) =>
    p.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.ceil(filteredProducts.length / 5) || 1;
  const displayPage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice((displayPage - 1) * 5, displayPage * 5);

  // ── Phase helpers ──
  const validatePhase = (phase: Phase, index: number, allPhases: Phase[]) => {
    if (!phase.phaseTitle.trim()) return `Phase ${index + 1}: Title is required`;
    if (!phase.badgeLabel.trim()) return `Phase ${index + 1}: Badge Label is required`;
    const val = parseFloat(phase.discountValue);
    if (isNaN(val) || val <= 0) return `Phase ${index + 1}: Discount value must be a positive number`;
    if (discountType === "percentage" && val > 100) return `Phase ${index + 1}: Percentage cannot exceed 100%`;
    if (!phase.startDate || !phase.endDate) return `Phase ${index + 1}: Start and end dates required`;
    const start = new Date(`${phase.startDate}T${phase.startTime}:00${offset}`);
    const end = new Date(`${phase.endDate}T${phase.endTime}:00${offset}`);
    if (end <= start) return `Phase ${index + 1}: End must be after start`;
    if (index > 0) {
      const prev = allPhases[index - 1];
      const prevEnd = new Date(`${prev.endDate}T${prev.endTime}:00${offset}`);
      if (start < prevEnd) return `Phase ${index + 1}: Start must be at or after Phase ${index}'s End`;
    }
    return null;
  };

  const handleUpdatePhaseField = (index: number, field: keyof Phase, val: any) =>
    setPhases((prev) => { const n = [...prev]; n[index] = { ...n[index], [field]: val }; return n; });

  const handleSavePhase = (index: number, e: any) => {
    e.preventDefault();
    const error = validatePhase(phases[index], index, phases);
    if (error) { shopify.toast.show(error, { isError: true }); return; }
    setPhases((prev) => { const n = [...prev]; n[index].isSaved = true; return n; });
    shopify.toast.show(`Phase ${index + 1} saved!`);
  };

  const handleEditPhase = (index: number, e: any) => {
    e.preventDefault();
    setPhases((prev) => { const n = [...prev]; n[index].isSaved = false; return n; });
  };

  const handleRemovePhase = (index: number, e: any) => {
    e.preventDefault();
    if (phases.length === 1) { shopify.toast.show("At least one phase is required", { isError: true }); return; }
    setPhases((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddMorePhase = (e: any) => {
    e.preventDefault();
    const last = phases[phases.length - 1];
    if (last && !last.isSaved) {
      const error = validatePhase(last, phases.length - 1, phases);
      if (error) { shopify.toast.show(error, { isError: true }); return; }
      setPhases((prev) => { const n = [...prev]; n[n.length - 1].isSaved = true; return n; });
    }
    const prevEnd = last ? { date: last.endDate, time: last.endTime } : undefined;
    setPhases((prev) => [...prev, createEmptyPhase(prev.length + 1, storeTimezone, prevEnd)]);
  };

  const handleSaveCampaign = (e: any) => {
    e.preventDefault();
    if (!name.trim()) { shopify.toast.show("Campaign name is required", { isError: true }); return; }

    let targetValue = "";
    if (productOption === "products") targetValue = selectedVariants.map((v) => v.id).join(",");
    else if (productOption === "collections") targetValue = selectedCollections.map((c) => c.id).join(",");
    else targetValue = selectedTags.join(",");

    const nextPhases = phases.map((p) => ({ ...p }));
    for (let i = 0; i < nextPhases.length; i++) {
      if (!nextPhases[i].isSaved) {
        const error = validatePhase(nextPhases[i], i, nextPhases);
        if (error) { shopify.toast.show(error, { isError: true }); return; }
        nextPhases[i].isSaved = true;
      }
    }
    setPhases(nextPhases);

    const stagesToSubmit = nextPhases.map((phase) => ({
      phaseTitle: phase.phaseTitle, badgeLabel: phase.badgeLabel,
      discountValue: parseFloat(phase.discountValue),
      startDate: `${phase.startDate}T${phase.startTime}:00${offset}`,
      endDate: `${phase.endDate}T${phase.endTime}:00${offset}`,
    }));

    const f = new FormData();
    if (campaignId) f.append("id", campaignId);
    f.append("name", name);
    f.append("discountType", discountType === "percentage" ? "PERCENTAGE" : discountType === "fixed_discount" ? "FIXED_DISCOUNT" : "FIX_AMOUNT");
    f.append(
      "targetType",
      productOption === "products" ? "VARIANT"
        : productOption === "collections" ? "COLLECTION"
        : "TAG"
    );
    f.append("targetValue", targetValue);
    f.append("stages", JSON.stringify(stagesToSubmit));
    submit(f, { method: "POST" });
  };

  const handleDiscard = (e: any) => {
    e.preventDefault();
    if (initialValuesRef.current) {
      const initial = initialValuesRef.current;
      setName(initial.name);
      setDiscountType(initial.discountType);
      setProductOption(initial.productOption);
      setSelectedProducts(initial.selectedProducts);
      setSelectedCollections(initial.selectedCollections);
      setSelectedVariants(initial.selectedVariants || []);
      setCollectionProductsMap(initial.collectionProductsMap);
      setSelectedTags(initial.selectedTags);
      setTagProducts(initial.tagProducts);
      setPhases(initial.phases);
      shopify.toast.show("Changes discarded");
    }
  };

  const getCampaignStatus = () => {
    if (campaignId && campaign) {
      if (campaign.status === "DRAFT" || campaign.status === "PAUSED") {
        return "Draft";
      }
    }
    if (!name.trim()) return "Draft";
    const now = new Date();
    const starts = phases.map((p) => new Date(`${p.startDate}T${p.startTime}:00${offset}`));
    const ends = phases.map((p) => new Date(`${p.endDate}T${p.endTime}:00${offset}`));
    const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
    const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
    if (maxEnd <= now) return "Completed";
    if (minStart <= now && maxEnd > now) return "Active";
    return "Scheduled";
  };

  const statusTone = (s: string) => s === "Active" ? "success" : s === "Scheduled" ? "info" : "neutral";

  // ── Discount label/suffix helpers ──
  const discountLabel = discountType === "percentage" 
    ? "Discount percent" 
    : discountType === "fixed_discount"
      ? "Discount amount (Off)"
      : "Target price amount";
  const discountSuffix = discountType === "percentage" ? "%" : currency;
  const discountMax = discountType === "percentage" ? 100 : undefined;

  return (
    <form data-save-bar data-discard-confirmation onSubmit={handleSaveCampaign} onReset={handleDiscard}>
      <s-page heading={campaignId ? "Edit Campaign" : "Create Campaign"}>
        <s-link slot="breadcrumb-actions" onClick={() => navigate(campaignId ? `/app/campaigns/${campaignId}` : "/app/campaigns")}>Campaigns</s-link>
      <s-section {...visibleStyle}>
        <s-box paddingBlockEnd="base">
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-heading>Campaign Details</s-heading>
            {campaignId && campaign && (
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-text tone="neutral">Current Status:</s-text>
                <StatusBadge status={campaign.status} />
              </s-stack>
            )}
          </s-stack>
        </s-box>

        {/* ── Campaign Name ── */}
        <s-card>
          <s-text-field
            label="Campaign Name"
            placeholder="Enter campaign name"
            value={name}
            onChange={(e: any) => setName(e.currentTarget.value)}
          />
        </s-card>
        <s-divider />

        {/* ── Discount Type ── */}
        <s-box paddingBlock="base">
          <s-choice-list ref={discountChoiceRef} label="Discount Type" name="discountType">
            <s-choice value="percentage" selected={discountType === "percentage" ? true : undefined}>
              Percentage (%)
            </s-choice>
            <s-choice value="fixed" selected={discountType === "fixed" ? true : undefined}>
              Fixed Amount ({currency})
            </s-choice>
            <s-choice value="fixed_discount" selected={discountType === "fixed_discount" ? true : undefined}>
              Discount Fixed Amount ({currency})
            </s-choice>
          </s-choice-list>
        </s-box>
        <s-divider />

        {/* ── Product Option ── */}
        <s-box paddingBlock="base">
          <s-choice-list ref={productChoiceRef} label="Apply campaign to" name="productOption">
            <s-choice value="products" selected={productOption === "products" ? true : undefined}>
              Specific Products
            </s-choice>
            <s-choice value="collections" selected={productOption === "collections" ? true : undefined}>
              Collections
            </s-choice>
            <s-choice value="tags" selected={productOption === "tags" ? true : undefined}>
              Product Tags
            </s-choice>

          </s-choice-list>
        </s-box>
        <s-divider />

        {/* ── Products section ── */}
        <s-box paddingBlock="base">

          {/* Collections: show selected badges */}
          {productOption === "collections" && selectedCollections.length > 0 && (
            <s-box paddingBlockEnd="small">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--p-space-200)" }}>
                {selectedCollections.map((col) => (
                  <s-stack key={col.id} direction="inline" gap="small" alignItems="center">
                    <s-badge tone="info">{col.title}</s-badge>
                    <s-button
                      variant="tertiary"
                      icon="delete"
                      accessibilityLabel={`Remove ${col.title}`}
                      tone="critical"
                      onClick={() => handleRemoveCollection(col.id)}
                    />
                  </s-stack>
                ))}
              </div>
            </s-box>
          )}

          {/* Tags: show selected badges */}
          {productOption === "tags" && selectedTags.length > 0 && (
            <s-box paddingBlockEnd="small">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--p-space-200)" }}>
                {selectedTags.map((tag) => (
                  <s-stack key={tag} direction="inline" gap="small" alignItems="center">
                    <s-badge tone="info">{tag}</s-badge>
                    <s-button
                      variant="tertiary"
                      icon="delete"
                      accessibilityLabel={`Remove tag ${tag}`}
                      tone="critical"
                      onClick={() => handleRemoveTag(tag)}
                    />
                  </s-stack>
                ))}
              </div>
            </s-box>
          )}

          {/* Tags: input field for adding tags */}
          {productOption === "tags" && (
            <s-box paddingBlockEnd="base">
              <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="end">
                <s-stack gap="small">
                  <s-text-field
                    label="Add Product Tag"
                    placeholder="e.g. summer-sale, new-arrival"
                    value={tagInput}
                    onChange={(e: any) => setTagInput(e.currentTarget.value)}
                    ref={(el: any) => {
                      if (el) {
                        el.onkeydown = (e: any) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag(e);
                          }
                        };
                      }
                    }}
                  />
                </s-stack>
                <s-button onClick={handleAddTag} loading={tagLoading ? true : undefined}>
                  Add Tag
                </s-button>
              </s-grid>
            </s-box>
          )}

          {/* Product/Collection table */}
          <s-table>
            <s-grid slot="filters" gap="small-200" gridTemplateColumns="1fr auto">
              <s-text-field
                label="Search"
                labelAccessibilityVisibility="exclusive"
                icon="search"
                placeholder={
                  productOption === "products" ? "Search selected products…"
                    : productOption === "collections" ? "Search products in selected collections…"
                    : "Search products by tag…"
                }
                value={searchQuery}
                onChange={(e: any) => { setSearchQuery(e.currentTarget.value); setCurrentPage(1); }}
              />
              {/* Browse button for products & collections & variants */}
              {productOption !== "tags" && (
                <s-button onClick={handleBrowse}>
                  Browse {productOption === "collections" ? "Collections" : "Products"}
                </s-button>
              )}
            </s-grid>

            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="secondary" format="numeric">Action</s-table-header>
            </s-table-header-row>

            <s-table-body>
              {paginatedProducts.length === 0 ? (
                <s-table-row>
                  <s-table-cell>
                    <s-text tone="neutral">
                      {productOption === "products"
                        ? "No products selected. Click 'Browse Products' to add products and their variants."
                        : productOption === "collections" && selectedCollections.length === 0
                          ? "No collections selected. Click 'Browse Collections' to add."
                          : productOption === "tags" && selectedTags.length === 0
                            ? "Add a product tag above to see matching products here."
                            : searchQuery
                              ? `No products found matching "${searchQuery}".`
                              : tagLoading
                                ? "Loading products…"
                                : "No products found for the selected filters."}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>—</s-table-cell>
                </s-table-row>
              ) : (
                paginatedProducts.map((product) => (
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
                            src={product.featuredImage?.url || product.image || "https://picsum.photos/id/29/80/80"}
                          />
                        </s-clickable>
                        <s-stack direction="block" gap="small">
                          <s-text>{product.title}</s-text>
                          {/* In products mode: show selected variant names as chips conditionally */}
                          {productOption === "products" && (() => {
                            const totalVariants = productTotalVariantsMap[product.id] || [];
                            const hasOnlyDefaultVariant = totalVariants.length === 1 && totalVariants[0].title === "Default Title";
                            const isDefaultTitleSelected = (product as any).variantNames?.length === 1 && (product as any).variantNames[0] === "Default Title";
                            const allVariantsSelected = totalVariants.length > 0 && (product as any).variantIds?.length === totalVariants.length;

                            if (hasOnlyDefaultVariant || isDefaultTitleSelected || allVariantsSelected) {
                              return null;
                            }

                            return (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                                {(product as any).variantNames.map((vName: string, i: number) => (
                                  <span
                                    key={i}
                                    style={{
                                      fontSize: "11px",
                                      padding: "2px 8px",
                                      borderRadius: "12px",
                                      background: "var(--p-color-bg-surface-secondary, #f1f1f1)",
                                      color: "var(--p-color-text-secondary, #555)",
                                      fontWeight: 500,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {vName}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                          {productOption === "tags" && product.tags?.length > 0 && (
                            <s-text color="subdued">
                              Tags: {product.tags.filter((t: string) =>
                                selectedTags.some((st) => st.toLowerCase() === t.toLowerCase())
                              ).join(", ")}
                            </s-text>
                          )}
                        </s-stack>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>
                      {productOption === "products" ? (
                        <s-button
                          icon="delete"
                          accessibilityLabel={`Remove ${product.title}`}
                          tone="critical"
                          onClick={() => handleRemoveProductVariants((product as any).id)}
                        />
                      ) : productOption === "collections" || productOption === "tags" ? (
                        <s-text color="subdued">—</s-text>
                      ) : null}
                    </s-table-cell>
                  </s-table-row>
                ))
              )}
            </s-table-body>
          </s-table>

          {/* Pagination */}
          {totalPages > 1 && (
            <s-box paddingBlockStart="base">
              <s-stack direction="inline" gap="small" justifyContent="center" alignItems="center">
                <s-button
                  disabled={displayPage === 1 ? true : undefined}
                  onClick={(e: any) => { e.preventDefault(); if (displayPage > 1) setCurrentPage(displayPage - 1); }}
                >Previous</s-button>
                <s-text>Page {displayPage} of {totalPages}</s-text>
                <s-button
                  disabled={displayPage === totalPages ? true : undefined}
                  onClick={(e: any) => { e.preventDefault(); if (displayPage < totalPages) setCurrentPage(displayPage + 1); }}
                >Next</s-button>
              </s-stack>
            </s-box>
          )}
        </s-box>
        <s-divider />

        {/* ── Phases ── */}
        <s-box paddingBlock="base">
          <s-stack direction="block" gap="small-200">
            <s-heading>Campaign Phases</s-heading>
            <s-paragraph>
              Configure sequential discount phases. Times are in store timezone: (GMT{offset}) {storeTimezone}
            </s-paragraph>
          </s-stack>
        </s-box>

        <s-stack direction="block" gap="base">
          {phases.map((phase, index) =>
            phase.isSaved ? (
              /* ── Saved phase summary card ── */
              <s-box key={index} padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-badge tone="success">Phase {index + 1}</s-badge>
                      <s-text font-weight="semibold">{phase.phaseTitle}</s-text>
                    </s-stack>
                    <s-stack direction="inline" gap="small">
                      <s-button onClick={(e: any) => handleEditPhase(index, e)}>Edit</s-button>
                      <s-button tone="critical" onClick={(e: any) => handleRemovePhase(index, e)}>Remove</s-button>
                    </s-stack>
                  </s-stack>
                  <s-divider />
                  <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
                    <s-stack direction="block" gap="small">
                      <s-text color="subdued">Discount</s-text>
                      <s-text>
                        <strong>
                          {discountType === "percentage"
                            ? `${phase.discountValue}% OFF`
                            : discountType === "fixed_discount"
                              ? `${phase.discountValue} ${currency} OFF`
                              : `Price: ${phase.discountValue} ${currency}`}
                        </strong>
                      </s-text>
                    </s-stack>
                    <s-stack direction="block" gap="small">
                      <s-text color="subdued">Start</s-text>
                      <s-text>{phase.startDate} {phase.startTime}</s-text>
                    </s-stack>
                    <s-stack direction="block" gap="small">
                      <s-text color="subdued">End</s-text>
                      <s-text>{phase.endDate} {phase.endTime}</s-text>
                    </s-stack>
                  </s-grid>
                  <s-text color="subdued">
                    Badge: "{phase.badgeLabel}"
                  </s-text>
                </s-stack>
              </s-box>
            ) : (
              /* ── Active phase edit card ── */
              <s-box key={index} padding="base" border="base" borderRadius="base" {...visibleStyle}>
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                    <s-heading>Configure Phase {index + 1}</s-heading>
                    {phases.length > 1 && (
                      <s-button tone="critical" onClick={(e: any) => handleRemovePhase(index, e)}>
                        Remove Phase
                      </s-button>
                    )}
                  </s-stack>

                  <s-text-field
                    label="Phase Title"
                    placeholder="e.g. Inner Circle Access"
                    value={phase.phaseTitle}
                    onChange={(e: any) => handleUpdatePhaseField(index, "phaseTitle", e.currentTarget.value)}
                  />

                  <s-text-field
                    label="Badge Label"
                    placeholder="e.g. Drop 1 — open now"
                    value={phase.badgeLabel}
                    onChange={(e: any) => handleUpdatePhaseField(index, "badgeLabel", e.currentTarget.value)}
                  />

                  {/*
                      s-number-field: use key to force remount when discountType changes
                      This ensures suffix/label/max attrs are correctly applied since
                      s-* web components don't react to React prop updates reliably.
                    */}
                  <s-number-field
                    key={`discount-${index}-${discountType}`}
                    ref={(el: HTMLElement | null) => { numberFieldRefs.current[index] = el; }}
                    label={discountLabel}
                    placeholder="10"
                    step={1}
                    min={1}
                    {...(discountMax !== undefined ? { max: discountMax } : {})}
                    suffix={discountSuffix}
                    value={phase.discountValue}
                    onChange={(e: any) => handleUpdatePhaseField(index, "discountValue", e.currentTarget.value)}
                  />

                  <s-stack direction="block" gap="small">
                    <s-heading>Schedule</s-heading>
                    <s-text color="subdued">
                      Store timezone: (GMT{offset}) {storeTimezone}
                    </s-text>

                    <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base" alignItems="end">
                      <s-grid-item gridColumn="span 6">
                        <s-date-field
                          label="Start date"
                          value={phase.startDate}
                          onChange={(e: any) => handleUpdatePhaseField(index, "startDate", e.currentTarget.value)}
                        />
                      </s-grid-item>
                      <s-grid-item gridColumn="span 6">
                        <s-select
                          label="Start time"
                          icon="watch"
                          value={phase.startTime}
                          onChange={(e: any) => handleUpdatePhaseField(index, "startTime", e.currentTarget.value)}
                        >
                          {getSelectOptionsWithDefault(phase.startTime).map((opt) => (
                            <s-option key={opt.value} value={opt.value}>{opt.label}</s-option>
                          ))}
                        </s-select>
                      </s-grid-item>
                    </s-grid>

                    <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base" alignItems="end">
                      <s-grid-item gridColumn="span 6">
                        <s-date-field
                          label="End date"
                          value={phase.endDate}
                          onChange={(e: any) => handleUpdatePhaseField(index, "endDate", e.currentTarget.value)}
                        />
                      </s-grid-item>
                      <s-grid-item gridColumn="span 6">
                        <s-select
                          label="End time"
                          icon="watch"
                          value={phase.endTime}
                          onChange={(e: any) => handleUpdatePhaseField(index, "endTime", e.currentTarget.value)}
                        >
                          {getSelectOptionsWithDefault(phase.endTime).map((opt) => (
                            <s-option key={opt.value} value={opt.value}>{opt.label}</s-option>
                          ))}
                        </s-select>
                      </s-grid-item>
                    </s-grid>
                  </s-stack>



                  <s-button variant="primary" onClick={(e: any) => handleSavePhase(index, e)}>
                    Save Phase {index + 1}
                  </s-button>
                </s-stack>
              </s-box>
            )
          )}
        </s-stack>

        <s-box paddingBlock="base">
          <s-button icon="plus" onClick={handleAddMorePhase}>Add Phase</s-button>
        </s-box>
      </s-section>

      {/* ── Aside Summary ── */}
      <s-section slot="aside">
        <s-card>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-heading>Live Summary</s-heading>
              {campaignId && campaign && (
                <>
                  {(campaign.status === "ACTIVE" || campaign.status === "SCHEDULED") && (
                    <s-button
                      icon="pause-circle"
                      onClick={() => actionFetcher.submit({ intent: "PAUSE" }, { method: "POST", action: `/app/campaigns/${campaignId}` })}
                      loading={actionFetcher.state !== "idle" ? true : undefined}
                    >
                      Pause Campaign
                    </s-button>
                  )}
                  {(campaign.status === "DRAFT" || campaign.status === "PAUSED") && (
                    <s-button
                      icon="play-circle"
                      onClick={() => actionFetcher.submit({ intent: "RESUME" }, { method: "POST", action: `/app/campaigns/${campaignId}` })}
                      loading={actionFetcher.state !== "idle" ? true : undefined}
                    >
                      Activate Campaign
                    </s-button>
                  )}
                </>
              )}
            </s-stack>
            <s-divider />
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-text tone="neutral">Status : </s-text>
                <s-badge tone={statusTone(getCampaignStatus())}>{getCampaignStatus()}</s-badge>
              </s-stack>
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-text tone="neutral">Discount type : </s-text>
                <s-badge>
                  {discountType === "percentage"
                    ? "Percentage (%)"
                    : discountType === "fixed_discount"
                      ? `Discount Fixed (${currency})`
                      : `Fixed Amount (${currency})`}
                </s-badge>
              </s-stack>
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-text tone="neutral">Target : </s-text>
                <s-badge>
                  {productOption === "products"
                    ? `${selectedVariants.length} variant${selectedVariants.length !== 1 ? "s" : ""} across ${new Set(selectedVariants.map((v: any) => v.productId)).size} product${new Set(selectedVariants.map((v: any) => v.productId)).size !== 1 ? "s" : ""}`
                    : productOption === "collections"
                      ? `${selectedCollections.length} collection${selectedCollections.length !== 1 ? "s" : ""}`
                      : `${selectedTags.length} tag${selectedTags.length !== 1 ? "s" : ""}`}
                </s-badge>
              </s-stack>
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-text color="subdued">Total Phases : </s-text>
                <s-text dir="rtl"><strong>{phases.length}</strong></s-text>
              </s-stack>
            </s-stack>
            <s-divider />
            <s-text><strong>Phase Breakdown </strong></s-text>
            <s-unordered-list>
              {phases.map((p, i) => (
                <s-list-item key={i}>
                  <s-stack direction="inline" gap="small" alignItems="center" justifyContent="space-between">
                    <s-text>{p.phaseTitle || `Phase ${i + 1}`}:</s-text>
                    <s-badge tone={p.discountValue ? "success" : "neutral"}>
                      {discountType === "percentage"
                        ? `${p.discountValue || "0"}% OFF`
                        : discountType === "fixed_discount"
                          ? `${p.discountValue || "0"} ${currency} OFF`
                          : `Price: ${p.discountValue || "0"} ${currency}`}
                    </s-badge>
                    {!p.isSaved && <s-badge tone="warning">Unsaved</s-badge>}
                  </s-stack>
                </s-list-item>
              ))}
            </s-unordered-list>
          </s-stack>
        </s-card>
      </s-section>

      <s-section>
        <s-card heading="Campaign Best Practices & Launch Guidelines">
          <s-box paddingBlock="base">
            <s-stack direction="block" gap="large">
              <s-text tone="neutral">
                Before launching your campaign, review these optimization guidelines to maximize conversion rate and protect profit margins.
              </s-text>

              <s-grid gridTemplateColumns="1fr 1fr" gap="small">
                <s-stack direction="block" gap="small" borderRadius="base" border="base" padding="base">
                  <s-text><strong>Tiered Discount Strategy</strong></s-text>
                  <s-text tone="neutral">
                    Start with a larger discount in Stage 1 to generate early sales momentum, then decrease the discount in subsequent stages to lock in higher margins.
                  </s-text>
                </s-stack>

                <s-stack direction="block" gap="small" borderRadius="base" border="base" padding="base">
                  <s-text><strong>Profit Margin Safeguard</strong></s-text>
                  <s-text tone="neutral">
                    Always confirm that your baseline price exceeds the cost of goods sold. When multiple campaigns target the same variant, the conflict strategy resolves which price will apply.
                  </s-text>
                </s-stack>
              </s-grid>

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-text><strong>Launch Checklist</strong></s-text>
                <s-stack gap="small">
                  <s-text tone="neutral">✓ Ensure the countdown timer app embed is enabled in your theme customizer settings.</s-text>
                  <s-text tone="neutral">✓ Double check start and end dates inside the store's timezone.</s-text>
                  <s-text tone="neutral">✓ Review the products targeted in the top panel to ensure accurate selection.</s-text>
                </s-stack>
              </s-stack>
            </s-stack>
          </s-box>
        </s-card>
      </s-section>

      <s-stack direction="inline" justifyContent="end" gap="base">
        <s-button type="submit" variant="primary" loading={isSaving ? true : undefined}>
          Save Campaign
        </s-button>
      </s-stack>
    </s-page>
  </form>
  );
}