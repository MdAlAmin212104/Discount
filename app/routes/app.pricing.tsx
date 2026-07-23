import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { getShopifyPricingUrl } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pricingUrl = getShopifyPricingUrl(session.shop);

  return { pricingUrl };
};

export default function PricingRoute() {
  const { pricingUrl } = useLoaderData<typeof loader>();

  useEffect(() => {
    // Escape iframe and redirect top-level parent browser window to Shopify Managed Pricing page
    if (typeof window !== "undefined" && pricingUrl) {
      if (window.top && window.top !== window) {
        window.top.location.href = pricingUrl;
      } else {
        window.location.href = pricingUrl;
      }
    }
  }, [pricingUrl]);

  return (
    <>
      {/* Executed instantly on client before render to prevent iframe connection refusal */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if (typeof window !== "undefined" && window.top && window.top !== window) {
              window.top.location.href = ${JSON.stringify(pricingUrl)};
            }
          `,
        }}
      />
      <s-page heading="Redirecting to Shopify Pricing...">
        <s-section>
          <s-box padding="large-400">
            <s-stack gap="base" alignItems="center" justifyContent="center">
              <s-text>Opening Shopify Managed Pricing Plans in parent window...</s-text>
              <s-button
                variant="primary"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    if (window.top) window.top.location.href = pricingUrl;
                    else window.location.href = pricingUrl;
                  }
                }}
              >
                Go to Shopify Pricing
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      </s-page>
    </>
  );
}
