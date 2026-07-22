import prisma from "../db.server";
import { LogEvent } from "@prisma/client";

interface ConflictResult {
  hasConflict: boolean;
  lowestPrice: number;
  conflictingCampaignIds: string[];
  chosenCampaignId: string;
  chosenDiscountValue: number;
}

/**
 * Checks for conflicts on a variant and returns the details and the lowest price.
 */
export async function checkAndResolveConflicts(
  shopId: string,
  variantId: string,
  currentCampaignId: string,
  proposedPrice: number,
  proposedDiscountValue: number,
  originalPrice: number
): Promise<ConflictResult> {
  // Query snapshots for this variant in this shop where the campaign is currently ACTIVE
  const activeSnapshots = await prisma.variantPriceSnapshot.findMany({
    where: {
      shopId,
      variantId,
      campaignId: { not: currentCampaignId }, // other campaigns
      campaign: {
        status: "ACTIVE",
      },
    },
    include: {
      campaign: {
        include: {
          stages: {
            where: { status: "ACTIVE" },
          },
        },
      },
    },
  });

  if (activeSnapshots.length === 0) {
    return {
      hasConflict: false,
      lowestPrice: proposedPrice,
      conflictingCampaignIds: [],
      chosenCampaignId: currentCampaignId,
      chosenDiscountValue: proposedDiscountValue,
    };
  }

  // Identify all active campaigns and their current price
  const candidates = [
    {
      campaignId: currentCampaignId,
      price: proposedPrice,
      discountValue: proposedDiscountValue,
    },
  ];

  const conflictingCampaignIds: string[] = [];

  for (const snapshot of activeSnapshots) {
    conflictingCampaignIds.push(snapshot.campaignId);
    
    // Calculate the active price for this candidate
    // Let's get the active stage
    const activeStage = snapshot.campaign.stages[0];
    const discountValue = activeStage ? activeStage.discountValue : 0;
    const discountType = snapshot.campaign.discountType;

    let candidatePrice = originalPrice;
    if (discountType === "PERCENTAGE") {
      candidatePrice = originalPrice * (1 - discountValue / 100);
    } else if (discountType === "FIX_AMOUNT") {
      candidatePrice = discountValue;
    } else if (discountType === "FIXED_DISCOUNT") {
      candidatePrice = Math.max(0, originalPrice - discountValue);
    }

    candidates.push({
      campaignId: snapshot.campaignId,
      price: candidatePrice,
      discountValue: discountValue,
    });
  }

  // Fetch conflict strategy from theme settings
  const settings = await prisma.themeSettings.findUnique({
    where: { shopId }
  });
  const strategy = settings?.conflictStrategy || "HIGHEST_DISCOUNT";

  // Find candidate based on strategy
  if (strategy === "LOWEST_DISCOUNT") {
    // Sort descending by price (highest price/lowest discount first)
    candidates.sort((a, b) => b.price - a.price);
  } else {
    // Sort ascending by price (lowest price/highest discount first)
    candidates.sort((a, b) => a.price - b.price);
  }
  const bestCandidate = candidates[0];

  return {
    hasConflict: true,
    lowestPrice: bestCandidate.price,
    conflictingCampaignIds,
    chosenCampaignId: bestCandidate.campaignId,
    chosenDiscountValue: bestCandidate.discountValue,
  };
}

/**
 * Logs a conflict to the ActivityLog table
 */
export async function logConflict(
  shopId: string,
  campaignId: string,
  variantId: string,
  conflictingCampaignIds: string[],
  chosenCampaignId: string,
  chosenPrice: number,
  originalPrice: number
) {
  const message = `Conflict detected for variant ${variantId}. Applied campaign ${chosenCampaignId} with price $${chosenPrice.toFixed(
    2
  )} (Original: $${originalPrice.toFixed(2)}). Conflicting campaign IDs: ${conflictingCampaignIds.join(", ")}`;

  await prisma.activityLog.create({
    data: {
      shopId,
      campaignId,
      event: LogEvent.CONFLICT_DETECTED,
      message,
      metadata: {
        variantId,
        conflictingCampaignIds,
        chosenCampaignId,
        chosenPrice,
        originalPrice,
      },
    },
  });
}

/**
 * Re-evaluates all active campaign conflicts for a shop when conflict strategy changes.
 */
export async function reevaluateActiveCampaignConflicts(
  shopId: string,
  admin: any,
  strategy: string
) {
  const { updateVariantPriceWithRetry } = await import("./shopify-price.server");

  const activeSnapshots = await prisma.variantPriceSnapshot.findMany({
    where: {
      shopId,
      campaign: { status: "ACTIVE" },
    },
    include: {
      campaign: {
        include: {
          stages: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  if (activeSnapshots.length === 0) return;

  // Group snapshots by variantId
  const variantMap = new Map<string, typeof activeSnapshots>();
  for (const snap of activeSnapshots) {
    const list = variantMap.get(snap.variantId) || [];
    list.push(snap);
    variantMap.set(snap.variantId, list);
  }

  for (const [variantId, snapshots] of variantMap.entries()) {
    if (snapshots.length === 0) continue;

    const originalPrice = snapshots[0].originalPrice;

    const candidates = snapshots.map((snap) => {
      const activeStage = snap.campaign.stages[0];
      const discountValue = activeStage ? activeStage.discountValue : 0;
      const discountType = snap.campaign.discountType;

      let price = originalPrice;
      if (discountType === "PERCENTAGE") {
        price = originalPrice * (1 - discountValue / 100);
      } else if (discountType === "FIX_AMOUNT") {
        price = discountValue;
      } else if (discountType === "FIXED_DISCOUNT") {
        price = Math.max(0, originalPrice - discountValue);
      }

      return {
        campaignId: snap.campaignId,
        price,
        discountValue,
      };
    });

    if (strategy === "LOWEST_DISCOUNT") {
      candidates.sort((a, b) => b.price - a.price);
    } else {
      candidates.sort((a, b) => a.price - b.price);
    }

    const bestCandidate = candidates[0];

    // Update price on Shopify
    await updateVariantPriceWithRetry(admin, variantId, bestCandidate.price, originalPrice);

    // Update currentPrice in DB for all snapshots of this variant
    for (const snap of snapshots) {
      await prisma.variantPriceSnapshot.update({
        where: {
          shopId_campaignId_variantId: {
            shopId,
            campaignId: snap.campaignId,
            variantId,
          },
        },
        data: {
          currentPrice: bestCandidate.price,
        },
      });
    }

    // Log conflict if there are multiple active candidate campaigns
    if (snapshots.length > 1) {
      const conflictingCampaignIds = candidates.map((c) => c.campaignId);
      await logConflict(
        shopId,
        bestCandidate.campaignId,
        variantId,
        conflictingCampaignIds,
        bestCandidate.campaignId,
        bestCandidate.price,
        originalPrice
      );
    }
  }
}
