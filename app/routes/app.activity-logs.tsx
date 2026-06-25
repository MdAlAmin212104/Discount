import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";
import type { LogEvent } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const event = url.searchParams.get("event") || "ALL";
  const campaignId = url.searchParams.get("campaignId") || "ALL";
  const pageSize = 25;

  const where: any = { shopId: shop.id };
  if (event !== "ALL") where.event = event as LogEvent;
  if (campaignId !== "ALL") where.campaignId = campaignId;

  const [logs, totalLogs, campaigns] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { campaign: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
    prisma.campaign.findMany({ where: { shopId: shop.id }, select: { id: true, name: true } }),
  ]);

  return { logs, page, totalPages: Math.ceil(totalLogs / pageSize), totalLogs, campaigns, event, campaignId };
};

const LOG_EVENTS = ["PRICE_UPDATED", "PRICE_RESTORED", "CONFLICT_DETECTED", "SCHEDULER_ERROR", "STAGE_STARTED", "STAGE_COMPLETED", "CAMPAIGN_CREATED", "CAMPAIGN_UPDATED"];

function EventBadge({ event }: { event: string }) {
  const toneMap: Record<string, string> = {
    PRICE_UPDATED: "success", PRICE_RESTORED: "success",
    CONFLICT_DETECTED: "attention", SCHEDULER_ERROR: "critical",
    STAGE_STARTED: "info", STAGE_COMPLETED: "info",
  };
  return <s-badge tone={toneMap[event] ?? "neutral"}>{event}</s-badge>;
}

export default function ActivityLogs() {
  const { logs, page, totalPages, totalLogs, campaigns, event, campaignId } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleFilter = (key: string, value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    url.searchParams.set("page", "1");
    navigate(url.pathname + url.search);
  };

  return (
    <s-page title="Activity Logs" subtitle="Audit log of all scheduler activity, price updates, and conflicts">

      {/* Filters */}
      <s-grid>
        <s-stack direction="inline" gap="base">
          <s-select
            label="Event Type"
            value={event}
            onChange={(e: any) => handleFilter("event", e.currentTarget.value)}
          >
            <option value="ALL">All Events</option>
            {LOG_EVENTS.map((ev) => (
              <option key={ev} value={ev}>{ev}</option>
            ))}
          </s-select>

          <s-select
            label="Campaign"
            value={campaignId}
            onChange={(e: any) => handleFilter("campaignId", e.currentTarget.value)}
          >
            <option value="ALL">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </s-select>
        </s-stack>
      </s-grid>

      {/* Table */}
      <s-grid padding="none">
        {logs.length === 0 ? (
          <s-stack padding="large" align-items="center" justify-content="center">
            <s-text tone="subdued">No activity logs found.</s-text>
          </s-stack>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--p-border-subdued)" }}>
                  {["Date/Time", "Event", "Campaign", "Message"].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left" }}>
                      <s-text font-weight="semibold" variant="bodySm">{h}</s-text>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid var(--p-border-subdued)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <s-text tone="subdued" variant="bodySm">{new Date(log.createdAt).toLocaleString()}</s-text>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <EventBadge event={log.event} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <s-text font-weight="semibold">{log.campaign?.name ?? "—"}</s-text>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <s-text>{log.message}</s-text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <s-stack direction="inline" justify-content="space-between" align-items="center" padding="base">
              <s-text tone="subdued">Showing {logs.length} of {totalLogs} entries</s-text>
              <s-stack direction="inline" gap="small">
                <s-button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => handleFilter("page", String(page - 1))}
                >
                  Previous
                </s-button>
                <s-text>Page {page} of {totalPages}</s-text>
                <s-button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => handleFilter("page", String(page + 1))}
                >
                  Next
                </s-button>
              </s-stack>
            </s-stack>
          </>
        )}
      </s-grid>
    </s-page>
  );
}
