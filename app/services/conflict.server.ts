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
      candidatePrice = Math.max(0, originalPrice - discountValue);
    }

    candidates.push({
      campaignId: snapshot.campaignId,
      price: candidatePrice,
      discountValue: discountValue,
    });
  }

  // Find candidate with lowest price
  candidates.sort((a, b) => a.price - b.price);
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
