import cron from "node-cron";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  fetchVariantsForTargets,
  updateVariantPriceWithRetry,
  cleanGid,
} from "./shopify-price.server";
import { checkAndResolveConflicts, logConflict } from "./conflict.server";
import { JobStatus, CampaignStatus, StageStatus, LogEvent } from "@prisma/client";

let isSchedulerRunning = false;

// Gracefully re-queue any PROCESSING jobs on startup (Railway cold starts)
export async function requeueProcessingJobs() {
  try {
    const updated = await prisma.schedulerJob.updateMany({
      where: { status: JobStatus.PROCESSING },
      data: { status: JobStatus.PENDING },
    });
    if (updated.count > 0) {
      console.log(`Re-queued ${updated.count} jobs from PROCESSING back to PENDING.`);
    }
  } catch (error) {
    console.error("Failed to re-queue processing jobs on startup:", error);
  }
}

// Process a single scheduled stage job
export async function processStageJob(job: any) {
  const { id, shopId, stageId } = job;
  console.log(`Processing SchedulerJob ${id} for stage ${stageId}`);

  // Fetch campaign and stage
  const stage = await prisma.campaignStage.findUnique({
    where: { id: stageId },
    include: {
      campaign: {
        include: {
          shop: true,
          products: true,
        },
      },
    },
  });

  if (!stage || !stage.campaign) {
    console.error(`Stage or campaign not found for job ${id}`);
    await prisma.schedulerJob.update({
      where: { id },
      data: {
        status: JobStatus.FAILED,
        lastError: "Stage or campaign not found in DB",
        processedAt: new Date(),
      },
    });
    return;
  }

  const campaign = stage.campaign;
  const shop = campaign.shop;

  try {
    // Authenticate
    const { admin } = await unauthenticated.admin(shop.domain);

    // Resolve target variants
    const resolvedVariants = await fetchVariantsForTargets(admin, campaign.products);
    console.log(`Resolved ${resolvedVariants.length} variants for stage ${stageId}`);

    // Process variants in batches of 10
    const batchSize = 10;
    for (let i = 0; i < resolvedVariants.length; i += batchSize) {
      const batch = resolvedVariants.slice(i, i + batchSize);

      for (const variant of batch) {
        // 1. Get true original price. Check if there's ANY snapshot in DB for this variant.
        const existingSnapshot = await prisma.variantPriceSnapshot.findFirst({
          where: {
            shopId: shop.id,
            variantId: variant.variantId,
          },
        });

        const originalPrice = existingSnapshot ? existingSnapshot.originalPrice : variant.price;

        // 2. Create/upsert snapshot for the current campaign
        await prisma.variantPriceSnapshot.upsert({
          where: {
            shopId_campaignId_variantId: {
              shopId: shop.id,
              campaignId: campaign.id,
              variantId: variant.variantId,
            },
          },
          update: {
            originalPrice,
            currentPrice: variant.price, // temporary until updated below
          },
          create: {
            shopId: shop.id,
            campaignId: campaign.id,
            variantId: variant.variantId,
            originalPrice,
            currentPrice: variant.price,
          },
        });

        // 3. Calculate proposed discounted price
        let proposedPrice = originalPrice;
        if (campaign.discountType === "PERCENTAGE") {
          proposedPrice = originalPrice * (1 - stage.discountValue / 100);
        } else if (campaign.discountType === "FIX_AMOUNT") {
          proposedPrice = stage.discountValue;
        }

        // 4. Check for conflicts with other active campaigns
        const conflict = await checkAndResolveConflicts(
          shop.id,
          variant.variantId,
          campaign.id,
          proposedPrice,
          stage.discountValue,
          originalPrice
        );

        const finalPrice = conflict.lowestPrice;

        // 5. Update variant price on Shopify
        await updateVariantPriceWithRetry(admin, variant.variantId, finalPrice, originalPrice);

        // 6. Update local snapshot currentPrice
        await prisma.variantPriceSnapshot.update({
          where: {
            shopId_campaignId_variantId: {
              shopId: shop.id,
              campaignId: campaign.id,
              variantId: variant.variantId,
            },
          },
          data: {
            currentPrice: finalPrice,
          },
        });

        // 7. Log activity
        if (conflict.hasConflict) {
          await logConflict(
            shop.id,
            campaign.id,
            variant.variantId,
            conflict.conflictingCampaignIds,
            conflict.chosenCampaignId,
            finalPrice,
            originalPrice
          );
        } else {
          await prisma.activityLog.create({
            data: {
              shopId: shop.id,
              campaignId: campaign.id,
              event: LogEvent.PRICE_UPDATED,
              message: `Updated variant ${cleanGid(variant.variantId)} price to $${finalPrice.toFixed(
                2
              )} (Original: $${originalPrice.toFixed(2)}) for campaign "${campaign.name}" Stage ${stage.stageNumber}`,
            },
          });
        }
      }

      // Batch delay
      if (i + batchSize < resolvedVariants.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Update Stage status -> ACTIVE, other stages of this campaign -> COMPLETED (if they were active)
    await prisma.campaignStage.updateMany({
      where: {
        campaignId: campaign.id,
        id: { not: stageId },
        status: StageStatus.ACTIVE,
      },
      data: { status: StageStatus.COMPLETED },
    });

    await prisma.campaignStage.update({
      where: { id: stageId },
      data: { status: StageStatus.ACTIVE },
    });

    // Update Campaign status -> ACTIVE
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.ACTIVE },
    });

    // Log Stage Start
    await prisma.activityLog.create({
      data: {
        shopId: shop.id,
        campaignId: campaign.id,
        event: LogEvent.STAGE_STARTED,
        message: `Stage ${stage.stageNumber} ("${stage.label || `Stage ${stage.stageNumber}`}") started for campaign "${campaign.name}"`,
      },
    });

    // Job completed successfully
    await prisma.schedulerJob.update({
      where: { id },
      data: {
        status: JobStatus.COMPLETED,
        processedAt: new Date(),
      },
    });
  } catch (error: any) {
    console.error(`Error processing stage job ${id}:`, error);
    const attempts = job.attempts + 1;
    const isFinalFailure = attempts >= 3;

    await prisma.schedulerJob.update({
      where: { id },
      data: {
        status: isFinalFailure ? JobStatus.FAILED : JobStatus.PENDING,
        attempts,
        lastError: error.message || String(error),
      },
    });

    await prisma.activityLog.create({
      data: {
        shopId: shop.id,
        campaignId: campaign.id,
        event: LogEvent.SCHEDULER_ERROR,
        message: `Scheduler job failed for Stage ${stage.stageNumber} (Attempt ${attempts}/3): ${error.message || String(error)}`,
      },
    });
  }
}

// Check for and process ending campaigns
async function processEndingCampaigns() {
  const now = new Date();
  // Find active campaigns that have reached their end date
  const endingCampaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
      endDate: { lte: now },
    },
    include: {
      shop: true,
    },
  });

  for (const campaign of endingCampaigns) {
    console.log(`Ending Campaign ${campaign.id} ("${campaign.name}")`);
    const shop = campaign.shop;

    try {
      const { admin } = await unauthenticated.admin(shop.domain);

      // Get all price snapshots for this campaign
      const snapshots = await prisma.variantPriceSnapshot.findMany({
        where: {
          shopId: shop.id,
          campaignId: campaign.id,
        },
      });

      console.log(`Restoring prices for ${snapshots.length} variants for campaign ${campaign.id}`);

      // Process in batches
      const batchSize = 10;
      for (let i = 0; i < snapshots.length; i += batchSize) {
        const batch = snapshots.slice(i, i + batchSize);

        for (const snapshot of batch) {
          // Check if there are other active campaigns targeting this variant
          const otherActiveCampaigns = await prisma.variantPriceSnapshot.findMany({
            where: {
              shopId: shop.id,
              variantId: snapshot.variantId,
              campaignId: { not: campaign.id },
              campaign: { status: CampaignStatus.ACTIVE },
            },
            include: {
              campaign: {
                include: {
                  stages: { where: { status: StageStatus.ACTIVE } },
                },
              },
            },
          });

          if (otherActiveCampaigns.length > 0) {
            // There are other active campaigns. Resolve conflict.
            const candidates = otherActiveCampaigns.map((snap) => {
              const activeStage = snap.campaign.stages[0];
              const discountValue = activeStage ? activeStage.discountValue : 0;
              const discountType = snap.campaign.discountType;

              let price = snapshot.originalPrice;
              if (discountType === "PERCENTAGE") {
                price = snapshot.originalPrice * (1 - discountValue / 100);
              } else if (discountType === "FIX_AMOUNT") {
                price = discountValue;
              }

              return {
                campaignId: snap.campaignId,
                price,
                discountValue,
              };
            });

            // Sort candidate prices ascending (lowest price first)
            candidates.sort((a, b) => a.price - b.price);
            const bestCandidate = candidates[0];

            // Set variant price to the best candidate price
            await updateVariantPriceWithRetry(
              admin,
              snapshot.variantId,
              bestCandidate.price,
              snapshot.originalPrice
            );

            // Update the active campaign's snapshot currentPrice to reflect the price after restoring
            await prisma.variantPriceSnapshot.update({
              where: {
                shopId_campaignId_variantId: {
                  shopId: shop.id,
                  campaignId: bestCandidate.campaignId,
                  variantId: snapshot.variantId,
                },
              },
              data: {
                currentPrice: bestCandidate.price,
              },
            });

            // Log conflict resolution
            await prisma.activityLog.create({
              data: {
                shopId: shop.id,
                campaignId: campaign.id,
                event: LogEvent.PRICE_RESTORED,
                message: `Campaign ended. Variant ${cleanGid(snapshot.variantId)} price set to next active campaign ${
                  bestCandidate.campaignId
                } price: $${bestCandidate.price.toFixed(2)} (Original: $${snapshot.originalPrice.toFixed(2)})`,
              },
            });
          } else {
            // No other active campaigns. Restore to original price
            await updateVariantPriceWithRetry(
              admin,
              snapshot.variantId,
              snapshot.originalPrice,
              null // Clear compareAtPrice or restore if they have one? We set compareAtPrice to null or original
            );

            // Log price restore
            await prisma.activityLog.create({
              data: {
                shopId: shop.id,
                campaignId: campaign.id,
                event: LogEvent.PRICE_RESTORED,
                message: `Campaign ended. Restored variant ${cleanGid(snapshot.variantId)} price to original $${snapshot.originalPrice.toFixed(
                  2
                )}`,
              },
            });
          }

          // Delete the snapshot for this finished campaign
          await prisma.variantPriceSnapshot.delete({
            where: {
              shopId_campaignId_variantId: {
                shopId: shop.id,
                campaignId: campaign.id,
                variantId: snapshot.variantId,
              },
            },
          });
        }

        // Batch delay
        if (i + batchSize < snapshots.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Update campaign status -> COMPLETED, all its stages -> COMPLETED
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.COMPLETED },
      });

      await prisma.campaignStage.updateMany({
        where: { campaignId: campaign.id },
        data: { status: StageStatus.COMPLETED },
      });

      // Log Campaign Completion
      await prisma.activityLog.create({
        data: {
          shopId: shop.id,
          campaignId: campaign.id,
          event: LogEvent.STAGE_COMPLETED,
          message: `Campaign "${campaign.name}" completed successfully. All original prices restored.`,
        },
      });
    } catch (error: any) {
      console.error(`Error completing campaign ${campaign.id}:`, error);
      await prisma.activityLog.create({
        data: {
          shopId: shop.id,
          campaignId: campaign.id,
          event: LogEvent.SCHEDULER_ERROR,
          message: `Failed to complete campaign and restore prices: ${error.message || String(error)}`,
        },
      });
    }
  }
}

// Main tick execution loop
export async function runSchedulerTick() {
  const now = new Date();

  try {
    // 1. Process due jobs
    const dueJobs = await prisma.schedulerJob.findMany({
      where: {
        status: JobStatus.PENDING,
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: "asc" },
    });

    if (dueJobs.length > 0) {
      console.log(`Scheduler: Found ${dueJobs.length} due jobs.`);
      for (const job of dueJobs) {
        // Mark as processing
        await prisma.schedulerJob.update({
          where: { id: job.id },
          data: { status: JobStatus.PROCESSING },
        });

        // Run in background (don't block the loop)
        processStageJob(job).catch((err) => {
          console.error(`Unhandled error processing job ${job.id}:`, err);
        });
      }
    }

    // 2. Process ending campaigns
    await processEndingCampaigns();
  } catch (error) {
    console.error("Error in scheduler tick:", error);
  }
}

// Initialize the scheduler
export function initScheduler() {
  if (isSchedulerRunning) {
    console.warn("Scheduler is already running.");
    return;
  }

  isSchedulerRunning = true;
  console.log("Initializing scheduler...");

  // Re-queue processing jobs immediately on startup
  requeueProcessingJobs();

  // Run every 1 minute
  cron.schedule("* * * * *", () => {
    console.log("Scheduler tick: running scheduled job checks...");
    runSchedulerTick();
  });
}
