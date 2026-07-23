import prisma from "../db.server";

export interface PlanDetails {
  name: string;
  planType: string;
  price: number;
  maxVariants: number;
  maxCampaigns: number;
  maxMultiStageCampaigns: number;
}

export const BILLING_PLANS: Record<string, PlanDetails> = {
  "Free Plan": {
    name: "Free Plan",
    planType: "FREE",
    price: 0,
    maxVariants: 100,
    maxCampaigns: 3,
    maxMultiStageCampaigns: 2,
  },
  "Basic Plan": {
    name: "Basic Plan",
    planType: "BASIC",
    price: 8.99,
    maxVariants: 500,
    maxCampaigns: 10,
    maxMultiStageCampaigns: 5,
  },
  "Standard Plan": {
    name: "Standard Plan",
    planType: "STANDARD",
    price: 12.99,
    maxVariants: 1200,
    maxCampaigns: 20,
    maxMultiStageCampaigns: 8,
  },
  "Unlimited Plan": {
    name: "Unlimited Plan",
    planType: "UNLIMITED",
    price: 19.99,
    maxVariants: Number.POSITIVE_INFINITY,
    maxCampaigns: Number.POSITIVE_INFINITY,
    maxMultiStageCampaigns: Number.POSITIVE_INFINITY,
  },
};

export const APP_HANDLE = "discountflow-4";

/**
 * Normalizes any string variation of plan names ("Free", "Basic", "Standard", "Unlimited")
 * to standard canonical plan names used in BILLING_PLANS.
 */
export function normalizePlanName(name: string): string {
  if (!name) return "Free Plan";
  const lower = name.toLowerCase().trim();
  if (lower.includes("unlimited")) return "Unlimited Plan";
  if (lower.includes("standard")) return "Standard Plan";
  if (lower.includes("basic")) return "Basic Plan";
  return "Free Plan";
}

/**
 * Returns uppercase planType string ("FREE", "BASIC", "STANDARD", "UNLIMITED").
 */
export function getPlanType(name: string): string {
  if (!name) return "FREE";
  const lower = name.toLowerCase().trim();
  if (lower.includes("unlimited")) return "UNLIMITED";
  if (lower.includes("standard")) return "STANDARD";
  if (lower.includes("basic")) return "BASIC";
  return "FREE";
}

/**
 * Returns Shopify's managed pricing plans page URL for a store.
 * Format: https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
 */
export function getShopifyPricingUrl(shopDomain: string): string {
  const storeHandle = shopDomain.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/pricing_plans`;
}

/**
 * Automatically queries Shopify GraphQL API for active subscriptions,
 * updates the database (Shop.planName, Shop.planType, Shop.subscriptionId, Shop.subscriptionStatus),
 * and returns the effective plan and limits for the shop based strictly on planType/planName.
 */
export async function getActiveBillingPlan(admin: any, shopId: string): Promise<PlanDetails> {
  let detectedPlanName = "Free Plan";
  let detectedSubscriptionId: string | null = null;
  let detectedSubscriptionStatus: string = "INACTIVE";

  try {
    const response = await admin.graphql(`#graphql
      query getAppActiveSubscriptions {
        appInstallation {
          activeSubscriptions {
            id
            name
            status
            createdAt
          }
        }
      }
    `);
    const json = await response.json();
    const activeSubscriptions = json.data?.appInstallation?.activeSubscriptions || [];
    
    // Find active subscription (ACTIVE or ACCEPTED)
    const activeSub = activeSubscriptions.find(
      (sub: any) => sub.status === "ACTIVE" || sub.status === "ACCEPTED"
    );

    if (activeSub) {
      detectedPlanName = normalizePlanName(activeSub.name);
      detectedSubscriptionId = activeSub.id;
      detectedSubscriptionStatus = activeSub.status || "ACTIVE";
    }
  } catch (error) {
    console.error("Error fetching Shopify active subscriptions via GraphQL:", error);
  }

  const detectedPlanType = getPlanType(detectedPlanName);

  // Automatic Database Sync: store planType, subscriptionId, subscriptionStatus, and planName in DB
  try {
    const dbShop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (dbShop) {
      const needsUpdate =
        dbShop.planName !== detectedPlanName ||
        dbShop.planType !== detectedPlanType ||
        dbShop.subscriptionId !== detectedSubscriptionId ||
        dbShop.subscriptionStatus !== detectedSubscriptionStatus;

      if (needsUpdate) {
        console.log(`[Billing Sync] Updating DB for shop ${shopId}: Plan=${detectedPlanName}, Type=${detectedPlanType}, Status=${detectedSubscriptionStatus}, SubId=${detectedSubscriptionId}`);
        await prisma.shop.update({
          where: { id: shopId },
          data: {
            planName: detectedPlanName,
            planType: detectedPlanType,
            subscriptionId: detectedSubscriptionId,
            subscriptionStatus: detectedSubscriptionStatus,
          },
        });
      }
    }
  } catch (dbErr) {
    console.error("Database shop billing sync error:", dbErr);
  }

  // Plan limits are dynamically derived strictly from detectedPlanName
  const basePlan = BILLING_PLANS[detectedPlanName] || BILLING_PLANS["Free Plan"];
  return { ...basePlan };
}

/**
 * Checks whether creating or updating a campaign complies with the store's
 * active billing plan limits (auto-synced from Shopify).
 */
export async function checkPlanLimits(
  admin: any,
  shopId: string,
  newCampaignData: {
    variantCount: number;
    stageCount: number;
    isEdit?: boolean;
    existingCampaignId?: string;
  }
): Promise<{ allowed: boolean; reason?: string; currentPlan: PlanDetails }> {
  const plan = await getActiveBillingPlan(admin, shopId);

  // 1. Check total campaign count limit (skip check if editing)
  if (!newCampaignData.isEdit) {
    const totalCampaigns = await prisma.campaign.count({
      where: { shopId },
    });
    if (totalCampaigns >= plan.maxCampaigns) {
      const maxText = Number.isFinite(plan.maxCampaigns) ? plan.maxCampaigns : "unlimited";
      return {
        allowed: false,
        reason: `Your current ${plan.name} allows a maximum of ${maxText} campaigns. You currently have ${totalCampaigns} campaigns. Please upgrade your plan to create more campaigns.`,
        currentPlan: plan,
      };
    }
  }

  // 2. Check multi-stage campaign count limit (if campaign has > 1 stage)
  if (newCampaignData.stageCount > 1) {
    const existingIsMultiStage = newCampaignData.existingCampaignId
      ? (await prisma.campaignStage.count({ where: { campaignId: newCampaignData.existingCampaignId } })) > 1
      : false;

    if (!existingIsMultiStage) {
      const multiStageCampaignsCount = await prisma.campaign.count({
        where: {
          shopId,
          stages: {
            some: {
              stageNumber: { gte: 2 },
            },
          },
        },
      });
      if (multiStageCampaignsCount >= plan.maxMultiStageCampaigns) {
        const maxText = Number.isFinite(plan.maxMultiStageCampaigns) ? plan.maxMultiStageCampaigns : "unlimited";
        return {
          allowed: false,
          reason: `Your current ${plan.name} allows a maximum of ${maxText} multi-stage campaigns. You currently have ${multiStageCampaignsCount} multi-stage campaigns. Please upgrade your plan to create more multi-stage campaigns.`,
          currentPlan: plan,
        };
      }
    }
  }

  // 3. Check product variant count limit
  if (newCampaignData.variantCount > plan.maxVariants) {
    const maxText = Number.isFinite(plan.maxVariants) ? plan.maxVariants : "unlimited";
    return {
      allowed: false,
      reason: `Your current ${plan.name} allows a maximum of ${maxText} product variants per campaign. You selected ${newCampaignData.variantCount} variants. Please upgrade your plan to include more variants.`,
      currentPlan: plan,
    };
  }

  return { allowed: true, currentPlan: plan };
}
