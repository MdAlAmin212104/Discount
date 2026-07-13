import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "react-router";
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
      memberLabel: formData.get("memberLabel") as string,
      welcomeHeading: formData.get("welcomeHeading") as string,
      welcomeEmphasis: formData.get("welcomeEmphasis") as string,
      welcomeSubHeading: formData.get("welcomeSubHeading") as string,
      productHeading: formData.get("productHeading") as string,
      reserveButtonText: formData.get("reserveButtonText") as string,
      buttonAction: formData.get("buttonAction") as string,
      bgColor: formData.get("bgColor") as string,
      textColor: formData.get("textColor") as string,
      borderColor: formData.get("borderColor") as string,
      cardColor: formData.get("cardColor") as string,
      accentColor: formData.get("accentColor") as string,
      mutedColor: formData.get("mutedColor") as string,
      paddingTop: parseInt((formData.get("paddingTop") as string) || "40"),
      paddingBottom: parseInt((formData.get("paddingBottom") as string) || "40"),
      maxWidth: parseInt((formData.get("maxWidth") as string) || "580"),
      conflictStrategy: (formData.get("conflictStrategy") as string) || "HIGHEST_DISCOUNT",
      publicShipping: formData.get("publicShipping") as string,
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
  const navigation = useNavigation();

  const isSaving = navigation.state !== "idle" && navigation.formMethod === "POST";

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

  // Customized fields state
  const [memberLabel, setMemberLabel] = useState(settings?.memberLabel ?? "Inner Circle Member");
  const [welcomeHeading, setWelcomeHeading] = useState(settings?.welcomeHeading ?? "Exclusive Access");
  const [welcomeEmphasis, setWelcomeEmphasis] = useState(settings?.welcomeEmphasis ?? "Offers");
  const [welcomeSubHeading, setWelcomeSubHeading] = useState(settings?.welcomeSubHeading ?? "Members get every release first, before public launch.");
  const [productHeading, setProductHeading] = useState(settings?.productHeading ?? "Selected Pieces");
  const [reserveButtonText, setReserveButtonText] = useState(settings?.reserveButtonText ?? "Reserve Now");
  const [buttonAction, setButtonAction] = useState(settings?.buttonAction ?? "cart");
  const [bgColor, setBgColor] = useState(settings?.bgColor ?? "#f0efeb");
  const [textColor, setTextColor] = useState(settings?.textColor ?? "#0e0e0d");
  const [borderColor, setBorderColor] = useState(settings?.borderColor ?? "#e2dfd9");
  const [cardColor, setCardColor] = useState(settings?.cardColor ?? "#faf9f7");
  const [accentColor, setAccentColor] = useState(settings?.accentColor ?? "#1a3a2a");
  const [mutedColor, setMutedColor] = useState(settings?.mutedColor ?? "#9a9792");
  const [paddingTop, setPaddingTop] = useState(settings?.paddingTop ?? 40);
  const [paddingBottom, setPaddingBottom] = useState(settings?.paddingBottom ?? 40);
  const [maxWidth, setMaxWidth] = useState(settings?.maxWidth ?? 580);
  const [conflictStrategy, setConflictStrategy] = useState(settings?.conflictStrategy ?? "HIGHEST_DISCOUNT");
  const [publicShipping, setPublicShipping] = useState(settings?.publicShipping ?? "Ships in ~5-7 days");

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
    f.append("memberLabel", memberLabel);
    f.append("welcomeHeading", welcomeHeading);
    f.append("welcomeEmphasis", welcomeEmphasis);
    f.append("welcomeSubHeading", welcomeSubHeading);
    f.append("productHeading", productHeading);
    f.append("reserveButtonText", reserveButtonText);
    f.append("buttonAction", buttonAction);
    f.append("bgColor", bgColor);
    f.append("textColor", textColor);
    f.append("borderColor", borderColor);
    f.append("cardColor", cardColor);
    f.append("accentColor", accentColor);
    f.append("mutedColor", mutedColor);
    f.append("paddingTop", paddingTop.toString());
    f.append("paddingBottom", paddingBottom.toString());
    f.append("maxWidth", maxWidth.toString());
    f.append("conflictStrategy", conflictStrategy);
    f.append("publicShipping", publicShipping);
    submit(f, { method: "POST" });
  };

  // ---- Storefront mock preview (kept as real HTML/CSS since this simulates the actual
  // storefront widget output, not the admin UI — Polaris components can't render this) ----
  const renderLivePreview = () => {
    const previewStyles = {
      backgroundColor: cardColor,
      color: textColor,
      padding: `${paddingTop}px 16px ${paddingBottom}px 16px`,
      boxSizing: "border-box" as const,
      width: "100%",
      maxWidth: `${maxWidth}px`,
      margin: "0 auto",
      borderRadius: `${borderRadius}px`,
      border: `1px solid ${borderColor}`,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    };

    return (
      <div style={{
        backgroundColor: "#ffffff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        borderRadius: "16px",
        border: "1px solid #e1e3e5",
        padding: "24px",
        display: "flex",
        justifyContent: "center",
        boxSizing: "border-box",
        width: "100%"
      }}>
        <style>{`
          .preview-timeline-wrapper {
            display: flex;
            flex-direction: column;
            width: 100%;
          }
          .preview-active-timer-card {
            box-sizing: border-box;
            text-align: center;
            padding: 24px 20px;
            background-color: ${bgColor};
            background-image: linear-gradient(135deg, ${bgColor}, ${accentColor});
            color: ${textColor};
            border-radius: ${borderRadius}px;
            margin-bottom: 24px;
          }
          .preview-active-timer-title {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 4px;
            color: ${textColor};
          }
          .preview-active-timer-subtitle {
            font-size: 13px;
            opacity: 0.85;
            margin-bottom: 20px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: ${textColor};
          }
          .preview-active-timer-countdown {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
          }
          .preview-countdown-col {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 50px;
          }
          .preview-countdown-num {
            font-size: 36px;
            font-weight: 700;
            line-height: 1;
            color: ${textColor};
          }
          .preview-countdown-lbl {
            font-size: 10px;
            font-weight: 500;
            opacity: 0.7;
            text-transform: uppercase;
            margin-top: 6px;
            letter-spacing: 0.05em;
            color: ${textColor};
          }
          .preview-countdown-sep {
            font-size: 32px;
            font-weight: 700;
            line-height: 1;
            opacity: 0.8;
            position: relative;
            top: -8px;
            color: ${textColor};
          }
          .preview-releases-list {
            display: flex;
            flex-direction: column;
            width: 100%;
          }
          .preview-release-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid ${borderColor};
          }
          .preview-release-row:last-child {
            border-bottom: none;
          }
          .preview-release-left {
            display: flex;
            flex-direction: column;
            gap: 4px;
            text-align: left;
          }
          .preview-release-eyebrow {
            font-size: 9px;
            font-weight: 600;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: ${mutedColor};
          }
          .preview-release-title {
            font-size: 16px;
            font-weight: 600;
            color: ${salePriceColor};
          }
          .preview-release-right {
            display: flex;
            flex-direction: column;
            gap: 4px;
            text-align: right;
          }
          .preview-release-price {
            font-family: Georgia, Garamond, serif;
            font-size: 18px;
            font-weight: 600;
          }
          .preview-release-price {
            color: ${originalPriceColor};
          }
          .preview-release-shipping {
            font-size: 11px;
            color: ${mutedColor};
          }
        `}</style>

        <div style={previewStyles}>
          <div className="preview-timeline-wrapper">
            <div className="preview-active-timer-card">
              <div className="preview-active-timer-title">{welcomeHeading}</div>
              <div className="preview-active-timer-subtitle">{countdownText}</div>
              
              <div className="preview-active-timer-countdown">
                <div className="preview-countdown-col">
                  <span className="preview-countdown-num">02</span>
                  <span className="preview-countdown-lbl">Days</span>
                </div>
                <span className="preview-countdown-sep">:</span>
                <div className="preview-countdown-col">
                  <span className="preview-countdown-num">23</span>
                  <span className="preview-countdown-lbl">Hrs</span>
                </div>
                <span className="preview-countdown-sep">:</span>
                <div className="preview-countdown-col">
                  <span className="preview-countdown-num">59</span>
                  <span className="preview-countdown-lbl">Mins</span>
                </div>
                <span className="preview-countdown-sep">:</span>
                <div className="preview-countdown-col">
                  <span className="preview-countdown-num">06</span>
                  <span className="preview-countdown-lbl">Secs</span>
                </div>
              </div>
            </div>

            <div className="preview-releases-list">
              <div className="preview-release-row">
                <div className="preview-release-left">
                  <div className="preview-release-eyebrow">DROP 2 - OPENS AFTER DROP 1</div>
                  <div className="preview-release-title">Second Release</div>
                </div>
                <div className="preview-release-right">
                  <div className="preview-release-price">£166.98</div>
                  <div className="preview-release-shipping">Ships in ~5-7 days</div>
                </div>
              </div>

              <div className="preview-release-row">
                <div className="preview-release-left">
                  <div className="preview-release-eyebrow">DROP 3 - PUBLIC RELEASE</div>
                  <div className="preview-release-title">Open To The Public</div>
                </div>
                <div className="preview-release-right">
                  <div className="preview-release-price">£253.00</div>
                  {publicShipping && publicShipping.trim() !== "" && (
                    <div className="preview-release-shipping">{publicShipping}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TABS = ["General Settings", "Colors & Styling", "Custom CSS"];

  return (
    <s-page heading="Theme Customization">
      <s-button slot="primary-action" variant="primary" onClick={handleSave} loading={isSaving ? true : undefined}>
        Save Settings
      </s-button>

      <s-stack direction="block" gap="large">
        {/* Tab bar */}
        <s-section>
          <s-stack direction="inline" gap="small">
            {TABS.map((tab, i) => (
              <s-button key={tab} variant={activeTab === i ? "primary" : "tertiary"} onClick={() => setActiveTab(i)}>
                {tab}
              </s-button>
            ))}
          </s-stack>
        </s-section>

        {/* General Settings tab */}
        {activeTab === 0 && (
          <s-section heading="Widget Content Labels">
            <s-stack direction="block" gap="large">
              <s-text-field 
                label="Timer Heading" 
                value={welcomeHeading} 
                onChange={(e: any) => setWelcomeHeading(e.currentTarget.value)} 
              />
              <s-text-field 
                label="Timer Subheading" 
                value={countdownText} 
                onChange={(e: any) => setCountdownText(e.currentTarget.value)} 
              />
              <s-text-field 
                label="Public Release Shipping Note" 
                value={publicShipping} 
                onChange={(e: any) => setPublicShipping(e.currentTarget.value)} 
                details="Specify shipping time for public release, e.g., 'Ships in ~5-7 days'. Leave empty to hide."
              />
              <s-select 
                label="Overlapping Campaigns Resolution Strategy" 
                value={conflictStrategy} 
                onChange={(e: any) => setConflictStrategy(e.currentTarget.value)}
              >
                <s-option value="HIGHEST_DISCOUNT">Apply Highest Discount (Lowest Price)</s-option>
                <s-option value="LOWEST_DISCOUNT">Apply Lowest Discount (Highest Price)</s-option>
              </s-select>
            </s-stack>
          </s-section>
        )}

        {/* Colors & Styling tab */}
        {activeTab === 1 && (
          <s-section heading="Colors & Layout">
            <s-stack direction="block" gap="large">
              <s-grid gridTemplateColumns="1fr 1fr" gap="large">
                <s-color-field 
                  label="Timer Card Color (Gradient Start)" 
                  value={bgColor} 
                  onChange={(e: any) => setBgColor(e.currentTarget.value)} 
                />
                <s-color-field 
                  label="Accent Color (Gradient End)" 
                  value={accentColor} 
                  onChange={(e: any) => setAccentColor(e.currentTarget.value)} 
                />
                <s-color-field 
                  label="Timer Text & Number Color" 
                  value={textColor} 
                  onChange={(e: any) => setTextColor(e.currentTarget.value)} 
                />
                <s-color-field 
                  label="Releases List Background Color" 
                  value={cardColor} 
                  onChange={(e: any) => setCardColor(e.currentTarget.value)} 
                />
                <s-color-field 
                  label="List text Color" 
                  value={salePriceColor} 
                  onChange={(e: any) => setSalePriceColor(e.currentTarget.value)} 
                />
                <s-color-field 
                  label="List Sale Price Color" 
                  value={originalPriceColor} 
                  onChange={(e: any) => setOriginalPriceColor(e.currentTarget.value)} 
                />
                <s-color-field 
                  label="Muted Text Color (Eyebrows & Shipping)" 
                  value={mutedColor} 
                  onChange={(e: any) => setMutedColor(e.currentTarget.value)} 
                />
                <s-color-field 
                  label="Divider Color" 
                  value={borderColor} 
                  onChange={(e: any) => setBorderColor(e.currentTarget.value)} 
                />
              </s-grid>
              <s-number-field 
                label="Border Radius (px)" 
                value={borderRadius.toString()} 
                min={0} 
                max={24} 
                onChange={(e: any) => setBorderRadius(Number(e.currentTarget.value))} 
              />
              <s-number-field 
                label="Max Width (px)" 
                value={maxWidth.toString()} 
                min={320} 
                max={1200} 
                step={10} 
                onChange={(e: any) => setMaxWidth(Number(e.currentTarget.value))} 
              />
              <s-number-field 
                label="Padding Top (px)" 
                value={paddingTop.toString()} 
                min={0} 
                max={100} 
                onChange={(e: any) => setPaddingTop(Number(e.currentTarget.value))} 
              />
              <s-number-field 
                label="Padding Bottom (px)" 
                value={paddingBottom.toString()} 
                min={0} 
                max={100} 
                onChange={(e: any) => setPaddingBottom(Number(e.currentTarget.value))} 
              />
            </s-stack>
          </s-section>
        )}

        {/* Custom CSS tab */}
        {activeTab === 2 && (
          <s-section heading="Custom Styling Rules">
            <s-stack direction="block" gap="large">
              <s-text-area
                label="Custom CSS Styles"
                details="Custom CSS rules will be injected directly into the storefront showcase widget."
                rows={12}
                value={customCss}
                onChange={(e: any) => setCustomCss(e.currentTarget.value)}
              />
            </s-stack>
          </s-section>
        )}

        {/* Live Storefront Preview (Always visible below active tab section) */}
        <s-section heading="Live Storefront Preview">
          <s-stack direction="block" gap="large">
            <s-text tone="neutral">
              Below is a preview of how the discount widget renders on your store using the current settings.
            </s-text>
            {renderLivePreview()}
          </s-stack>
        </s-section>
      </s-stack>

      {/* Onboarding & Guide Panel on the Side */}
      <s-section slot="aside">
        <s-stack gap="base">
          <s-card heading="How It Works">
            <s-box padding="base">
              <s-stack gap="small">
                <s-text><strong>⏰ Multi-Stage Urgency</strong></s-text>
                <s-text tone="neutral">
                  Campaigns automatically move your products through scheduled discount drops. The live countdown drives buyer urgency (FOMO) to purchase early.
                </s-text>
                <s-divider />
                <s-text><strong>🔄 Auto-Transition</strong></s-text>
                <s-text tone="neutral">
                  As each stage ends, the next stage starts automatically. Once all phases complete, prices return back to regular original values.
                </s-text>
              </s-stack>
            </s-box>
          </s-card>

          <s-card heading="Business Improvement Tips">
            <s-box padding="base">
              <s-stack gap="small">
                <s-text><strong>📈 Tiered Drop Strategy</strong></s-text>
                <s-text tone="neutral">
                  Start with a high discount (e.g. 20% off for Drop 1) and lower it in subsequent drops. This rewards early buyers and creates a rush of sales.
                </s-text>
                <s-divider />
                <s-text><strong>🚚 Dynamic Shipping Estimates</strong></s-text>
                <s-text tone="neutral">
                  Use the campaign phase builder to specify longer shipping times for future drops, allowing you to run pre-order campaigns seamlessly.
                </s-text>
              </s-stack>
            </s-box>
          </s-card>

          <s-card heading="Quick Setup Guide">
            <s-box padding="base">
              <s-stack gap="small">
                <s-text>1. Enable the <strong>Discount Timer</strong> App Embed block in your Shopify Theme Customizer.</s-text>
                <s-text>2. Create a campaign and define stages with specific start and end times.</s-text>
                <s-text>3. Assign products to your campaign. The widget displays only when a campaign stage goes active!</s-text>
              </s-stack>
            </s-box>
          </s-card>
        </s-stack>
      </s-section>
    </s-page>
  );
}
