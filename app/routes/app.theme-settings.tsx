import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useActionData, useNavigation } from "react-router";
import { useEffect, useState, useRef } from "react";
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
      welcomeHeading: formData.get("welcomeHeading") as string,
      countdownText: formData.get("countdownText") as string,
      publicShipping: formData.get("publicShipping") as string,
      conflictStrategy: (formData.get("conflictStrategy") as string) || "HIGHEST_DISCOUNT",
      bgColor: formData.get("bgColor") as string,
      accentColor: formData.get("accentColor") as string,
      textColor: formData.get("textColor") as string,
      cardColor: formData.get("cardColor") as string,
      salePriceColor: formData.get("salePriceColor") as string,
      originalPriceColor: formData.get("originalPriceColor") as string,
      mutedColor: formData.get("mutedColor") as string,
      borderColor: formData.get("borderColor") as string,
      borderRadius: parseInt((formData.get("borderRadius") as string) || "8"),
      maxWidth: parseInt((formData.get("maxWidth") as string) || "580"),
      paddingTop: parseInt((formData.get("paddingTop") as string) || "40"),
      paddingBottom: parseInt((formData.get("paddingBottom") as string) || "40"),
      customCss: (formData.get("customCss") as string) || "",
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

  const initialValuesRef = useRef({
    welcomeHeading: settings?.welcomeHeading ?? "Exclusive Access",
    countdownText: settings?.countdownText ?? "Ends in",
    publicShipping: settings?.publicShipping ?? "Ships in ~5-7 days",
    conflictStrategy: settings?.conflictStrategy ?? "HIGHEST_DISCOUNT",
    bgColor: settings?.bgColor ?? "#1A1A1A",
    accentColor: settings?.accentColor ?? "#111111",
    textColor: settings?.textColor ?? "#FFFFFF",
    cardColor: settings?.cardColor ?? "#FFFFFF",
    salePriceColor: settings?.salePriceColor ?? "#1A1A1A",
    originalPriceColor: settings?.originalPriceColor ?? "#D93939",
    mutedColor: settings?.mutedColor ?? "#707070",
    borderColor: settings?.borderColor ?? "#E5E5E5",
    borderRadius: settings?.borderRadius ?? 8,
    maxWidth: settings?.maxWidth ?? 580,
    paddingTop: settings?.paddingTop ?? 40,
    paddingBottom: settings?.paddingBottom ?? 40,
    customCss: settings?.customCss ?? "",
  });

  // Active form state
  const [welcomeHeading, setWelcomeHeading] = useState(settings?.welcomeHeading ?? "Exclusive Access");
  const [countdownText, setCountdownText] = useState(settings?.countdownText ?? "Ends in");
  const [publicShipping, setPublicShipping] = useState(settings?.publicShipping ?? "Ships in ~5-7 days");
  const [conflictStrategy, setConflictStrategy] = useState(settings?.conflictStrategy ?? "HIGHEST_DISCOUNT");
  const [bgColor, setBgColor] = useState(settings?.bgColor ?? "#1A1A1A");
  const [accentColor, setAccentColor] = useState(settings?.accentColor ?? "#111111");
  const [textColor, setTextColor] = useState(settings?.textColor ?? "#FFFFFF");
  const [cardColor, setCardColor] = useState(settings?.cardColor ?? "#FFFFFF");
  const [salePriceColor, setSalePriceColor] = useState(settings?.salePriceColor ?? "#1A1A1A");
  const [originalPriceColor, setOriginalPriceColor] = useState(settings?.originalPriceColor ?? "#D93939");
  const [mutedColor, setMutedColor] = useState(settings?.mutedColor ?? "#707070");
  const [borderColor, setBorderColor] = useState(settings?.borderColor ?? "#E5E5E5");
  const [borderRadius, setBorderRadius] = useState(settings?.borderRadius ?? 8);
  const [maxWidth, setMaxWidth] = useState(settings?.maxWidth ?? 580);
  const [paddingTop, setPaddingTop] = useState(settings?.paddingTop ?? 40);
  const [paddingBottom, setPaddingBottom] = useState(settings?.paddingBottom ?? 40);
  const [customCss, setCustomCss] = useState(settings?.customCss ?? "");

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("Theme settings saved!");
      if (actionData?.settings) {
        initialValuesRef.current = {
          welcomeHeading: actionData.settings.welcomeHeading ?? "Exclusive Access",
          countdownText: actionData.settings.countdownText ?? "Ends in",
          publicShipping: actionData.settings.publicShipping ?? "Ships in ~5-7 days",
          conflictStrategy: actionData.settings.conflictStrategy ?? "HIGHEST_DISCOUNT",
          bgColor: actionData.settings.bgColor ?? "#1A1A1A",
          accentColor: actionData.settings.accentColor ?? "#111111",
          textColor: actionData.settings.textColor ?? "#FFFFFF",
          cardColor: actionData.settings.cardColor ?? "#FFFFFF",
          salePriceColor: actionData.settings.salePriceColor ?? "#1A1A1A",
          originalPriceColor: actionData.settings.originalPriceColor ?? "#D93939",
          mutedColor: actionData.settings.mutedColor ?? "#707070",
          borderColor: actionData.settings.borderColor ?? "#E5E5E5",
          borderRadius: actionData.settings.borderRadius ?? 8,
          maxWidth: actionData.settings.maxWidth ?? 580,
          paddingTop: actionData.settings.paddingTop ?? 40,
          paddingBottom: actionData.settings.paddingBottom ?? 40,
          customCss: actionData.settings.customCss ?? "",
        };
      }
    } else if (actionData?.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData]);

  const handleSave = () => {
    const f = new FormData();
    f.append("welcomeHeading", welcomeHeading);
    f.append("countdownText", countdownText);
    f.append("publicShipping", publicShipping);
    f.append("conflictStrategy", conflictStrategy);
    f.append("bgColor", bgColor);
    f.append("accentColor", accentColor);
    f.append("textColor", textColor);
    f.append("cardColor", cardColor);
    f.append("salePriceColor", salePriceColor);
    f.append("originalPriceColor", originalPriceColor);
    f.append("mutedColor", mutedColor);
    f.append("borderColor", borderColor);
    f.append("borderRadius", borderRadius.toString());
    f.append("maxWidth", maxWidth.toString());
    f.append("paddingTop", paddingTop.toString());
    f.append("paddingBottom", paddingBottom.toString());
    f.append("customCss", customCss);
    submit(f, { method: "POST" });
  };

  const handleDiscard = (e: any) => {
    e.preventDefault();
    const initial = initialValuesRef.current;
    setWelcomeHeading(initial.welcomeHeading);
    setCountdownText(initial.countdownText);
    setPublicShipping(initial.publicShipping);
    setConflictStrategy(initial.conflictStrategy);
    setBgColor(initial.bgColor);
    setAccentColor(initial.accentColor);
    setTextColor(initial.textColor);
    setCardColor(initial.cardColor);
    setSalePriceColor(initial.salePriceColor);
    setOriginalPriceColor(initial.originalPriceColor);
    setMutedColor(initial.mutedColor);
    setBorderColor(initial.borderColor);
    setBorderRadius(initial.borderRadius);
    setMaxWidth(initial.maxWidth);
    setPaddingTop(initial.paddingTop);
    setPaddingBottom(initial.paddingBottom);
    setCustomCss(initial.customCss);
    shopify.toast.show("Changes discarded");
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
        padding: "24px 12px", // Less padding on sides on mobile
        display: "flex",
        justifyContent: "center",
        boxSizing: "border-box",
        width: "100%",
        overflow: "hidden" // Prevent horizontal page overflow
      }}>
        <style>{`
          .discountflow-timeline-wrapper {
            display: flex;
            flex-direction: column;
            width: 100%;
          }
          .discountflow-active-timer-card {
            box-sizing: border-box;
            text-align: center;
            padding: 24px 20px;
            background-color: ${bgColor};
            background-image: linear-gradient(135deg, ${bgColor}, ${accentColor});
            color: ${textColor};
            border-radius: ${borderRadius}px;
            margin-bottom: 24px;
          }
          .discountflow-active-timer-title {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 4px;
            color: ${textColor};
          }
          .discountflow-active-timer-subtitle {
            font-size: 13px;
            opacity: 0.85;
            margin-bottom: 20px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: ${textColor};
          }
          .sds-countdown {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
          }
          .sds-countdown-col {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 50px;
          }
          .sds-countdown-num {
            font-size: 36px;
            font-weight: 700;
            line-height: 1;
            color: ${textColor};
          }
          .sds-countdown-lbl {
            font-size: 10px;
            font-weight: 500;
            opacity: 0.7;
            text-transform: uppercase;
            margin-top: 6px;
            letter-spacing: 0.05em;
            color: ${textColor};
          }
          .sds-countdown-sep {
            font-size: 32px;
            font-weight: 700;
            line-height: 1;
            opacity: 0.8;
            position: relative;
            top: -8px;
            color: ${textColor};
          }
          .discountflow-releases-list {
            display: flex;
            flex-direction: column;
            width: 100%;
          }
          .discountflow-release-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid ${borderColor};
          }
          .discountflow-release-row:last-child {
            border-bottom: none;
          }
          .discountflow-release-left {
            display: flex;
            flex-direction: column;
            gap: 4px;
            text-align: left;
          }
          .discountflow-release-eyebrow {
            font-size: 9px;
            font-weight: 600;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: ${mutedColor};
          }
          .discountflow-release-title {
            font-size: 16px;
            font-weight: 600;
            color: ${salePriceColor};
          }
          .discountflow-release-right {
            display: flex;
            flex-direction: column;
            gap: 4px;
            text-align: right;
          }
          .sds-release-price {
            font-family: Georgia, Garamond, serif;
            font-size: 18px;
            font-weight: 600;
          }
          .sds-release-price {
            color: ${originalPriceColor};
          }
          .discountflow-release-shipping {
            font-size: 11px;
            color: ${mutedColor};
          }

          /* Responsive Scaling for Mobile Screens */
          @media only screen and (max-width: 580px) {
            .sds-countdown {
              gap: 6px;
            }
            .sds-countdown-col {
              min-width: 36px;
            }
            .sds-countdown-num {
              font-size: 28px !important;
            }
            .sds-countdown-sep {
              font-size: 24px !important;
              top: -4px !important;
            }
          }
          @media only screen and (max-width: 480px) {
            s-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>

        <div style={previewStyles}>
          <div className="discountflow-timeline-wrapper">
            <div className="discountflow-active-timer-card">
              <div className="discountflow-active-timer-title">{welcomeHeading}</div>
              <div className="discountflow-active-timer-subtitle">{countdownText}</div>
              
              <div className="sds-countdown">
                <div className="sds-countdown-col">
                  <span className="sds-countdown-num">02</span>
                  <span className="sds-countdown-lbl">Days</span>
                </div>
                <span className="sds-countdown-sep">:</span>
                <div className="sds-countdown-col">
                  <span className="sds-countdown-num">23</span>
                  <span className="sds-countdown-lbl">Hrs</span>
                </div>
                <span className="sds-countdown-sep">:</span>
                <div className="sds-countdown-col">
                  <span className="sds-countdown-num">59</span>
                  <span className="sds-countdown-lbl">Mins</span>
                </div>
                <span className="sds-countdown-sep">:</span>
                <div className="sds-countdown-col">
                  <span className="sds-countdown-num">06</span>
                  <span className="sds-countdown-lbl">Secs</span>
                </div>
              </div>
            </div>

            <div className="discountflow-releases-list">
              <div className="discountflow-release-row">
                <div className="discountflow-release-left">
                  <div className="discountflow-release-eyebrow">DROP 2 - OPENS AFTER DROP 1</div>
                  <div className="discountflow-release-title">Second Release</div>
                </div>
                <div className="discountflow-release-right">
                  <div className="sds-release-price">£166.98</div>
                  <div className="discountflow-release-shipping">Ships in ~5-7 days</div>
                </div>
              </div>

              <div className="discountflow-release-row">
                <div className="discountflow-release-left">
                  <div className="discountflow-release-eyebrow">DROP 3 - PUBLIC RELEASE</div>
                  <div className="discountflow-release-title">Open To The Public</div>
                </div>
                <div className="discountflow-release-right">
                  <div className="sds-release-price">£253.00</div>
                  {publicShipping && publicShipping.trim() !== "" && (
                    <div className="discountflow-release-shipping">{publicShipping}</div>
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
    <form data-save-bar data-discard-confirmation onSubmit={(e) => { e.preventDefault(); handleSave(); }} onReset={handleDiscard}>
      <s-page heading="Theme Customization">

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
                <s-text><strong>Multi-Stage Urgency</strong></s-text>
                <s-text tone="neutral">
                  Campaigns automatically move your products through scheduled discount drops. The live countdown drives buyer urgency (FOMO) to purchase early.
                </s-text>
                <s-divider />
                <s-text><strong>Auto-Transition</strong></s-text>
                <s-text tone="neutral">
                  As each stage ends, the next stage starts automatically. Once all phases complete, prices return back to regular original values.
                </s-text>
              </s-stack>
            </s-box>
          </s-card>

          <s-card heading="Business Improvement Tips">
            <s-box padding="base">
              <s-stack gap="small">
                <s-text><strong>Tiered Drop Strategy</strong></s-text>
                <s-text tone="neutral">
                  Start with a high discount (e.g. 20% off for Drop 1) and lower it in subsequent drops. This rewards early buyers and creates a rush of sales.
                </s-text>
                <s-divider />
                <s-text><strong>Dynamic Shipping Estimates</strong></s-text>
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

        <s-stack direction="inline" justifyContent="end" gap="base" paddingBlock="base">
          <s-button type="submit" variant="primary" loading={isSaving ? true : undefined}>
            Save Settings
          </s-button>
        </s-stack>
      </s-page>
    </form>
  );
}
