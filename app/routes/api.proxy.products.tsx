import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

// CORS and response headers for Public App Proxy
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  if (!shopDomain) {
    return new Response(
      JSON.stringify({ error: "Missing shop parameter" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // 1. Fetch shop from DB
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      include: { themeSettings: true },
    });

    if (!shop) {
      return new Response(
        JSON.stringify({ error: "Shop not registered" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 2. Fetch the campaign (specific campaignId or active fallback)
    const campaignIdParam = url.searchParams.get("campaignId");

    let campaign;
    if (campaignIdParam && campaignIdParam !== "active") {
      campaign = await prisma.campaign.findFirst({
        where: { id: campaignIdParam, shopId: shop.id },
        include: {
          stages: { orderBy: { stageNumber: "asc" } },
        },
      });
    } else {
      campaign = await prisma.campaign.findFirst({
        where: { shopId: shop.id, status: "ACTIVE" },
        include: {
          stages: { orderBy: { stageNumber: "asc" } },
        },
      });
    }

    if (!campaign) {
      return new Response(
        JSON.stringify({
          campaignName: null,
          stageLabel: null,
          stages: [],
          products: [],
          settings: shop.themeSettings,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=30",
          },
        }
      );
    }

    // Determine currently active stage by start/end date comparison
    const now = new Date();
    const activeStage = campaign.stages.find(
      (stage) => new Date(stage.startDate) <= now && new Date(stage.endDate) >= now
    ) || campaign.stages[0];

    let stageLabel = activeStage?.label || (activeStage ? `Stage ${activeStage.stageNumber}` : "");
    let isCirclePhase = false;
    let phaseTitle = "";
    let discountCode = "";
    let shippingNoteLeft = "";
    let shippingNoteRight = "";
    let visible = true;
    let autoApply = false;

    if (activeStage?.label) {
      try {
        const parsed = JSON.parse(activeStage.label);
        if (parsed && typeof parsed === "object" && parsed.isCirclePhase) {
          stageLabel = parsed.label || `Stage ${activeStage.stageNumber}`;
          isCirclePhase = true;
          phaseTitle = parsed.phaseTitle || "";
          discountCode = parsed.discountCode || "";
          shippingNoteLeft = parsed.shippingNoteLeft || "";
          shippingNoteRight = parsed.shippingNoteRight || "";
          visible = parsed.visible !== false;
          autoApply = parsed.autoApply === true;
        }
      } catch (e) {
        // Label is not JSON
      }
    }

    // Parse all stages to return to client
    const returnedStages = campaign.stages.map((s) => {
      let parsedLabel: any = {};
      try {
        parsedLabel = JSON.parse(s.label || "{}");
      } catch {}
      return {
        id: s.id,
        stageNumber: s.stageNumber,
        label: parsedLabel.label || s.label || `Stage ${s.stageNumber}`,
        phaseTitle: parsedLabel.phaseTitle || "",
        discountValue: s.discountValue,
        startDate: s.startDate,
        endDate: s.endDate,
        shippingNoteLeft: parsedLabel.shippingNoteLeft || "",
        shippingNoteRight: parsedLabel.shippingNoteRight || "",
        status: s.status,
      };
    });

    // 3. Fetch all variant snapshots for this campaign
    const snapshots = await prisma.variantPriceSnapshot.findMany({
      where: {
        shopId: shop.id,
        campaignId: campaign.id,
      },
    });

    if (snapshots.length === 0) {
      return new Response(
        JSON.stringify({
          campaignName: campaign.name,
          discountType: campaign.discountType,
          timezone: campaign.timezone,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          stageLabel,
          isCirclePhase,
          phaseTitle,
          discountCode,
          shippingNoteLeft,
          shippingNoteRight,
          visible,
          autoApply,
          stages: returnedStages,
          products: [],
          settings: shop.themeSettings,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=30",
          },
        }
      );
    }

    // 4. Load details for these variants from Shopify
    const { admin } = await unauthenticated.admin(shop.domain);
    const variantIds = snapshots.map((s) => s.variantId);

    const response = await admin.graphql(
      `#graphql
      query getVariantsDetails($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            id
            price
            title
            product {
              id
              title
              handle
              featuredImage {
                url
              }
            }
          }
        }
      }`,
      { variables: { ids: variantIds } }
    );

    const resJson = await response.json();
    const nodes = resJson.data?.nodes || [];

    // Map snapshots to resolved product details
    const productsMap: Map<string, any> = new Map();

    for (const node of nodes) {
      if (!node || !node.product) continue;

      const snapshot = snapshots.find((s) => s.variantId === node.id);
      if (!snapshot) continue;

      const productId = node.product.id;

      // Group by product so we return a list of products
      if (!productsMap.has(productId)) {
        productsMap.set(productId, {
          id: productId,
          title: node.product.title,
          handle: node.product.handle,
          image: node.product.featuredImage?.url || "",
          originalPrice: snapshot.originalPrice,
          discountedPrice: snapshot.currentPrice,
          variantId: node.id,
        });
      }
    }

    const products = Array.from(productsMap.values());

    return new Response(
      JSON.stringify({
        campaignName: campaign.name,
        discountType: campaign.discountType,
        timezone: campaign.timezone,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        stageLabel,
        isCirclePhase,
        phaseTitle,
        discountCode,
        shippingNoteLeft,
        shippingNoteRight,
        visible,
        autoApply,
        stages: returnedStages,
        products,
        settings: shop.themeSettings,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=30",
        },
      }
    );
  } catch (error: any) {
    console.error("App Proxy Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
