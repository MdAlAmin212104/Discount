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

    // 2. Fetch the active campaign
    const activeCampaign = await prisma.campaign.findFirst({
      where: {
        shopId: shop.id,
        status: "ACTIVE",
      },
      include: {
        stages: {
          where: { status: "ACTIVE" },
        },
      },
    });

    if (!activeCampaign) {
      return new Response(
        JSON.stringify({
          campaignName: null,
          stageLabel: null,
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

    const activeStage = activeCampaign.stages[0];

    // 3. Fetch all variant snapshots for this active campaign
    const snapshots = await prisma.variantPriceSnapshot.findMany({
      where: {
        shopId: shop.id,
        campaignId: activeCampaign.id,
      },
    });

    if (snapshots.length === 0) {
      return new Response(
        JSON.stringify({
          campaignName: activeCampaign.name,
          stageLabel: activeStage?.label || `Stage ${activeStage?.stageNumber}`,
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
        campaignName: activeCampaign.name,
        stageLabel: activeStage?.label || `Stage ${activeStage?.stageNumber}`,
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
