import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useActionData } from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma, { getOrCreateShop } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");

  // Upsert to ensure a default record always exists
  const settings = await prisma.themeSettings.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id },
    update: {},
  });
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken || "");
  const formData = await request.formData();

  try {
    const data = {
      badgeText: formData.get("badgeText") as string,
      countdownText: formData.get("countdownText") as string,
      stageLabelText: formData.get("stageLabelText") as string,
      customJs: (formData.get("customJs") as string) || "",
      customCss: (formData.get("customCss") as string) || "",
      fontSize: parseInt((formData.get("fontSize") as string) || "14"),
      fontWeight: formData.get("fontWeight") as string,
      salePriceColor: formData.get("salePriceColor") as string,
      originalPriceColor: formData.get("originalPriceColor") as string,
      badgeBg: formData.get("badgeBg") as string,
      badgeTextColor: formData.get("badgeTextColor") as string,
      padding: parseInt((formData.get("padding") as string) || "12"),
      borderRadius: parseInt((formData.get("borderRadius") as string) || "8"),
      alignment: formData.get("alignment") as string,
      sliderItems: parseInt((formData.get("sliderItems") as string) || "3"),
      cartMode: (formData.get("cartMode") as string) || "stay",
    };
    const updated = await prisma.themeSettings.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, ...data },
      update: data,
    });
    return { success: true, settings: updated };
  } catch (err: any) {
    return { error: err.message || "Failed to update settings" };
  }
};

export default function ThemeSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [activeTab, setActiveTab] = useState(0);

  // Form state
  const [badgeText, setBadgeText] = useState(settings?.badgeText ?? "Sale");
  const [countdownText, setCountdownText] = useState(settings?.countdownText ?? "Ends in");
  const [stageLabelText, setStageLabelText] = useState(settings?.stageLabelText ?? "Stage");
  const [customJs, setCustomJs] = useState(settings?.customJs ?? "");
  const [customCss, setCustomCss] = useState(settings?.customCss ?? "");
  const [fontSize, setFontSize] = useState(settings?.fontSize ?? 14);
  const [fontWeight, setFontWeight] = useState(settings?.fontWeight ?? "500");
  const [salePriceColor, setSalePriceColor] = useState(settings?.salePriceColor ?? "#E63946");
  const [originalPriceColor, setOriginalPriceColor] = useState(settings?.originalPriceColor ?? "#6B7280");
  const [badgeBg, setBadgeBg] = useState(settings?.badgeBg ?? "#E63946");
  const [badgeTextColor, setBadgeTextColor] = useState(settings?.badgeTextColor ?? "#FFFFFF");
  const [padding, setPadding] = useState(settings?.padding ?? 12);
  const [borderRadius, setBorderRadius] = useState(settings?.borderRadius ?? 8);
  const [alignment, setAlignment] = useState(settings?.alignment ?? "left");
  const [sliderItems, setSliderItems] = useState(settings?.sliderItems ?? 3);
  const [cartMode, setCartMode] = useState(settings?.cartMode ?? "stay");

  useEffect(() => {
    if (actionData?.success) shopify.toast.show("Theme settings saved!");
    else if (actionData?.error) shopify.toast.show(actionData.error, { isError: true });
  }, [actionData]);

  const handleSave = () => {
    const f = new FormData();
    f.append("badgeText", badgeText);
    f.append("countdownText", countdownText);
    f.append("stageLabelText", stageLabelText);
    f.append("customJs", customJs);
    f.append("customCss", customCss);
    f.append("fontSize", fontSize.toString());
    f.append("fontWeight", fontWeight);
    f.append("salePriceColor", salePriceColor);
    f.append("originalPriceColor", originalPriceColor);
    f.append("badgeBg", badgeBg);
    f.append("badgeTextColor", badgeTextColor);
    f.append("padding", padding.toString());
    f.append("borderRadius", borderRadius.toString());
    f.append("alignment", alignment);
    f.append("sliderItems", sliderItems.toString());
    f.append("cartMode", cartMode);
    submit(f, { method: "POST" });
  };

  const TABS = ["Content", "Typography", "Colors", "Layout", "Custom Code", "Live Preview"];

  return (
    <s-page heading="Theme Customization">
      <s-button slot="primary-action" variant="primary" onClick={handleSave}>
        Save Settings
      </s-button>

      {/* Tab Bar */}
      <div style={{ borderBottom: "1px solid var(--p-border-subdued)", marginBottom: "16px", paddingBottom: "8px" }}>
        <s-stack direction="inline" gap="small">
          {TABS.map((tab, i) => (
            <s-button key={tab} variant={activeTab === i ? "primary" : "tertiary"} onClick={() => setActiveTab(i)}>
              {tab}
            </s-button>
          ))}
        </s-stack>
      </div>

      {/* TAB 1: Content */}
      {activeTab === 0 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Widget Content Labels</s-heading>
            <s-text-field label="Badge Text" value={badgeText} onChange={(e: any) => setBadgeText(e.currentTarget.value)} />
            <s-text-field label="Countdown Text" value={countdownText} onChange={(e: any) => setCountdownText(e.currentTarget.value)} />
            <s-text-field label="Stage Label Text" value={stageLabelText} onChange={(e: any) => setStageLabelText(e.currentTarget.value)} />
          </s-stack>
        </s-grid>
      )}

      {/* TAB 2: Typography */}
      {activeTab === 1 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Typography</s-heading>
            <s-stack direction="block" gap="small">
              <s-text font-weight="semibold">Font Size: {fontSize}px</s-text>
              <input
                type="range"
                min={10}
                max={24}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </s-stack>
            <s-select
              label="Font Weight"
              value={fontWeight}
              onChange={(e: any) => setFontWeight(e.currentTarget.value)}
            >
              <option value="400">Normal (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">Semi-Bold (600)</option>
              <option value="700">Bold (700)</option>
            </s-select>
          </s-stack>
        </s-grid>
      )}

      {/* TAB 3: Colors */}
      {activeTab === 2 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Colors</s-heading>
            <s-stack direction="inline" gap="large">
              {[
                ["Sale Price Color", salePriceColor, setSalePriceColor],
                ["Original Price Color", originalPriceColor, setOriginalPriceColor],
                ["Badge Background", badgeBg, setBadgeBg],
                ["Badge Text Color", badgeTextColor, setBadgeTextColor],
              ].map(([label, value, setter]: any) => (
                <s-stack key={label} direction="block" gap="small">
                  <s-text font-weight="semibold">{label}</s-text>
                  <s-stack direction="inline" gap="small" align-items="center">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      style={{ width: "40px", height: "36px", borderRadius: "4px", border: "1px solid #ccc", padding: "2px", cursor: "pointer" }}
                    />
                    <s-text-field
                      label=""
                      value={value}
                      onChange={(e: any) => setter(e.currentTarget.value)}
                    />
                  </s-stack>
                </s-stack>
              ))}
            </s-stack>
          </s-stack>
        </s-grid>
      )}

      {/* TAB 4: Layout */}
      {activeTab === 3 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Layout</s-heading>
            <s-stack direction="block" gap="small">
              <s-text font-weight="semibold">Padding: {padding}px</s-text>
              <input type="range" min={4} max={32} value={padding} onChange={(e) => setPadding(Number(e.target.value))} style={{ width: "100%" }} />
            </s-stack>
            <s-stack direction="block" gap="small">
              <s-text font-weight="semibold">Border Radius: {borderRadius}px</s-text>
              <input type="range" min={0} max={16} value={borderRadius} onChange={(e) => setBorderRadius(Number(e.target.value))} style={{ width: "100%" }} />
            </s-stack>
            <s-select
              label="Alignment"
              value={alignment}
              onChange={(e: any) => setAlignment(e.currentTarget.value)}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </s-select>
            <s-select
              label="Products Per View (Slider)"
              value={sliderItems.toString()}
              onChange={(e: any) => setSliderItems(Number(e.currentTarget.value))}
            >
              <option value="2">2 Products</option>
              <option value="3">3 Products</option>
              <option value="4">4 Products</option>
              <option value="5">5 Products</option>
              <option value="6">6 Products</option>
            </s-select>
          </s-stack>
        </s-grid>
      )}

      {/* TAB 5: Custom Code */}
      {activeTab === 4 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Custom JavaScript & CSS</s-heading>
            
            <s-select
              label="Cart Action Mode"
              value={cartMode}
              onChange={(e: any) => setCartMode(e.currentTarget.value)}
            >
              <option value="stay">Stay on Page (AJAX / Dispatch Cart Update)</option>
              <option value="cart">Redirect to Cart Page</option>
              <option value="checkout">Redirect to Checkout</option>
            </s-select>

            <div>
              <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--p-color-text, #303030)", marginBottom: "4px", display: "block" }}>
                Custom Add-to-Cart JS Override
              </label>
              <textarea
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--p-color-border, #e1e3e5)",
                  borderRadius: "6px",
                  fontFamily: "monospace",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  backgroundColor: "var(--p-color-bg-surface, #ffffff)",
                  color: "var(--p-color-text, #303030)",
                  outline: "none",
                  resize: "vertical"
                }}
                rows={6}
                value={customJs}
                onChange={(e) => setCustomJs(e.target.value)}
              />
              <div style={{ fontSize: "12px", color: "var(--p-color-text-secondary, #616161)", marginTop: "4px" }}>
                Receives (variantId, quantity, context). context has {`{ variantId, quantity, form }`}. Overrides default action if return/execution succeeds.
              </div>
            </div>

            <div>
              <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--p-color-text, #303030)", marginBottom: "4px", display: "block" }}>
                Custom CSS Styles
              </label>
              <textarea
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--p-color-border, #e1e3e5)",
                  borderRadius: "6px",
                  fontFamily: "monospace",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  backgroundColor: "var(--p-color-bg-surface, #ffffff)",
                  color: "var(--p-color-text, #303030)",
                  outline: "none",
                  resize: "vertical"
                }}
                rows={6}
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
              />
              <div style={{ fontSize: "12px", color: "var(--p-color-text-secondary, #616161)", marginTop: "4px" }}>
                Custom CSS rules will be injected directly into the storefront showcase widget.
              </div>
            </div>
          </s-stack>
        </s-grid>
      )}

      {/* TAB 6: Live Preview */}
      {activeTab === 5 && (
        <s-grid>
          <s-stack direction="block" gap="large">
            <s-heading>Live Storefront Preview</s-heading>
            <div style={{ color: "var(--p-color-text-secondary, #616161)", fontSize: "14px" }}>
              Real-time preview of how the widget looks on your store's product pages.
            </div>

            <s-stack
              padding="large"
              align-items="center"
              justify-content="center"
            >
              <div
                style={{
                  maxWidth: "320px",
                  width: "100%",
                  backgroundColor: "#FFFFFF",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  border: "1px solid #E5E7EB",
                  borderRadius: `${borderRadius}px`,
                  padding: `${padding}px`,
                  textAlign: alignment as any,
                  fontFamily: "Inter, -apple-system, sans-serif",
                }}
              >
                <div style={{ position: "relative", height: "180px", backgroundColor: "#F3F4F6", borderRadius: `${Math.max(0, borderRadius - 2)}px`, marginBottom: "12px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#9CA3AF", fontSize: "13px" }}>Product Image</span>
                  <div style={{ position: "absolute", top: "8px", left: "8px", backgroundColor: badgeBg, color: badgeTextColor, padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>
                    {badgeText}
                  </div>
                </div>
                <div style={{ marginBottom: "6px", fontWeight: "600", fontSize: "14px", color: "#1F2937" }}>Smart Cotton Hooded Jacket</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", justifyContent: alignment === "center" ? "center" : alignment === "right" ? "flex-end" : "flex-start", fontSize: `${fontSize}px`, fontWeight: fontWeight }}>
                  <span style={{ color: salePriceColor, fontWeight: "700" }}>$79.99</span>
                  <span style={{ color: originalPriceColor, textDecoration: "line-through", fontSize: `${fontSize - 2}px` }}>$99.99</span>
                </div>
                <div style={{ fontSize: "11px", color: "#4B5563", backgroundColor: "#EFF6FF", padding: "5px 8px", borderRadius: "4px", borderLeft: "3px solid #3B82F6", marginBottom: "6px" }}>
                  <strong>{stageLabelText}:</strong> Early Bird Special (20% Off)
                </div>
                <div style={{ fontSize: "10px", color: "#DC2626", fontWeight: "600" }}>⏳ {countdownText} 2d 14h 5m</div>
              </div>
            </s-stack>
          </s-stack>
        </s-grid>
      )}
    </s-page>
  );
}
