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
    submit(f, { method: "POST" });
  };

  // ---- Storefront mock preview (kept as real HTML/CSS since this simulates the actual
  // storefront widget output, not the admin UI — Polaris components can't render this) ----
  const renderLivePreview = () => {
    const previewStyles = {
      backgroundColor: bgColor,
      color: textColor,
      padding: `${paddingTop}px 0 ${paddingBottom}px 0`,
      fontFamily: "'DM Mono', monospace",
      boxSizing: "border-box" as const,
      width: "100%",
      maxWidth: `${maxWidth}px`,
      margin: "0 auto",
      textAlign: alignment as any,
      transition: "all 0.2s ease",
    };

    return (
      <div style={{
        backgroundColor: "#ffffff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        borderRadius: "16px",
        border: "1px solid #e1e3e5",
        overflow: "hidden",
        width: "100%",
        boxSizing: "border-box"
      }}>
        <style>{`
          .circle-p-shell {
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            padding: 0 16px;
            box-sizing: border-box;
          }
          .circle-p-nav {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 16px;
            padding-top: 10px;
            margin-bottom: 20px;
          }
          .circle-p-member-pill {
            font-size: 9px;
            letter-spacing: .18em;
            text-transform: uppercase;
            color: ${accentColor};
            border: 0.5px solid rgba(26,58,42,0.28);
            padding: 4px 10px;
            border-radius: 99px;
            background: transparent;
          }
          .circle-p-signout {
            font-size: 9px;
            letter-spacing: .14em;
            text-transform: uppercase;
            color: ${mutedColor};
            text-decoration: none;
          }
          .circle-p-hero {
            padding: 8px 0 20px;
            border-bottom: 0.5px solid ${borderColor};
            margin-bottom: 20px;
          }
          .circle-p-live-line {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 8px;
            letter-spacing: .26em;
            text-transform: uppercase;
            color: ${accentColor};
            margin-bottom: 10px;
          }
          .circle-p-live-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: ${accentColor};
          }
          .circle-p-hero h1 {
            font-family: 'Cormorant Garamond', serif;
            font-weight: 300;
            font-size: 28px;
            line-height: 1.1;
            letter-spacing: .015em;
            margin: 0 0 10px;
            text-align: ${alignment};
            color: ${textColor};
          }
          .circle-p-hero h1 em {
            color: ${accentColor};
            font-style: italic;
          }
          .circle-p-hero-sub {
            font-size: 11px;
            color: ${mutedColor};
            line-height: 1.6;
            padding-left: 12px;
            border-left: 1.5px solid ${accentColor};
            text-align: left;
            margin: 0;
          }
          .circle-p-drop-strip {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px;
            margin-bottom: 24px;
          }
          .circle-p-drop-cell {
            border: 0.5px solid ${borderColor};
            border-radius: 8px;
            padding: 10px 8px;
            text-align: center;
            background: ${cardColor};
          }
          .circle-p-drop-cell.active-p {
            border-color: ${accentColor};
            box-shadow: 0 4px 12px rgba(0,0,0,0.04);
          }
          .circle-p-drop-num {
            font-size: 8px;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: ${mutedColor};
            margin-bottom: 4px;
          }
          .circle-p-drop-ships {
            font-size: 7px;
            color: ${accentColor};
            margin-bottom: 6px;
            text-transform: uppercase;
          }
          .circle-p-drop-price {
            font-family: 'Cormorant Garamond', serif;
            font-size: 16px;
            font-weight: 600;
            color: ${textColor};
          }
          .circle-p-drop-tag {
            font-size: 7px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 4px;
            color: ${mutedColor};
          }
          .circle-p-drop-cell.active-p .circle-p-drop-tag {
            color: ${accentColor};
            font-weight: 600;
          }
          .circle-p-card {
            background: ${cardColor};
            border: 0.5px solid ${borderColor};
            border-radius: 12px;
            padding: ${padding}px;
            margin-bottom: 20px;
            box-sizing: border-box;
          }
          .circle-p-card-label {
            font-size: 9px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: ${mutedColor};
            margin-bottom: 12px;
          }
          .circle-p-slider-track {
            display: flex;
            gap: 12px;
          }
          .circle-p-prod {
            flex: 1;
            display: flex;
            flex-direction: column;
            padding: 6px;
            border-radius: 8px;
            border: 0.5px solid transparent;
            box-sizing: border-box;
          }
          .circle-p-prod.active-p {
            background: #ffffff;
            border-color: ${borderColor};
          }
          .circle-p-prod-img {
            width: 100%;
            aspect-ratio: 1;
            background: #f4f3f0;
            border-radius: 6px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
          }
          .circle-p-prod-name {
            font-family: 'Cormorant Garamond', serif;
            font-size: 12px;
            font-weight: 600;
            color: ${textColor};
            line-height: 1.2;
            margin-bottom: 4px;
            text-align: left;
          }
          .circle-p-prod-status {
            font-size: 7px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: ${mutedColor};
            text-align: left;
          }
          .circle-p-prod.active-p .circle-p-prod-status {
            color: ${accentColor};
            font-weight: 600;
          }
          .circle-p-action-block {
            background: ${cardColor};
            border: 0.5px solid ${borderColor};
            border-radius: 12px;
            padding: 20px 16px;
            text-align: center;
            margin-bottom: 20px;
            box-sizing: border-box;
          }
          .circle-p-action-eyebrow {
            font-size: 8px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: ${mutedColor};
            margin-bottom: 8px;
          }
          .circle-p-countdown-wrap {
            margin: 12px 0;
          }
          .circle-p-countdown-label {
            font-size: 7px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: ${mutedColor};
            margin-bottom: 4px;
          }
          .circle-p-countdown {
            display: flex;
            align-items: center;
            gap: 4px;
            justify-content: center;
          }
          .circle-p-t-block {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 28px;
          }
          .circle-p-t-num {
            font-family: 'DM Mono', monospace;
            font-size: 14px;
            font-weight: 600;
            color: ${textColor};
          }
          .circle-p-t-lbl {
            font-size: 7px;
            text-transform: uppercase;
            color: ${mutedColor};
          }
          .circle-p-t-sep {
            font-family: 'DM Mono', monospace;
            font-size: 14px;
            color: ${borderColor};
          }
          .circle-p-price-block {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 16px 0;
            border-top: 0.5px solid ${borderColor};
            border-bottom: 0.5px solid ${borderColor};
            padding: 10px 0;
          }
          .circle-p-price-main, .circle-p-price-future {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .circle-p-price-context {
            font-size: 7px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: ${mutedColor};
            margin-bottom: 2px;
          }
          .circle-p-price-amount {
            font-family: 'Cormorant Garamond', serif;
            font-size: 18px;
            font-weight: 700;
            color: ${accentColor};
          }
          .circle-p-price-was {
            font-family: 'Cormorant Garamond', serif;
            font-size: 14px;
            color: ${mutedColor};
            text-decoration: line-through;
          }
          .circle-p-cta-btn {
            width: 100%;
            background: ${accentColor};
            color: #ffffff;
            border: none;
            padding: 10px 20px;
            font-family: 'DM Mono', monospace;
            font-size: 9px;
            font-weight: 500;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            border-radius: 4px;
            cursor: pointer;
          }
          .circle-p-cta-meta {
            margin-top: 8px;
            font-size: 7px;
            color: ${mutedColor};
            display: flex;
            justify-content: space-around;
            gap: 4px;
          }
          .circle-p-cta-meta p {
            margin: 0;
          }
          .circle-p-locked-row {
            background: ${cardColor};
            border: 0.5px solid ${borderColor};
            border-radius: 10px;
            padding: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
            margin-bottom: 8px;
          }
          .circle-p-locked-left {
            text-align: left;
          }
          .circle-p-locked-eyebrow {
            font-size: 7px;
            color: ${mutedColor};
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 2px;
          }
          .circle-p-locked-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 13px;
            color: ${textColor};
          }
          .circle-p-locked-right {
            text-align: right;
          }
          .circle-p-locked-price-amount {
            font-family: 'Cormorant Garamond', serif;
            font-size: 14px;
            font-weight: 600;
            color: ${mutedColor};
          }
          .circle-p-locked-when {
            font-size: 7px;
            color: ${mutedColor};
            margin-top: 2px;
          }
        `}</style>

        <div style={previewStyles}>
          <div className="circle-p-shell">
            <nav className="circle-p-nav">
              <div className="circle-p-member-pill">{memberLabel}</div>
              <div className="circle-p-signout">Sign Out</div>
            </nav>

            <div className="circle-p-hero">
              <div className="circle-p-live-line" style={{ justifyContent: alignment === "center" ? "center" : alignment === "right" ? "flex-end" : "flex-start" }}>
                <span className="circle-p-live-dot"></span>
                <span>Drop 1 open now</span>
              </div>
              <h1>
                {welcomeHeading}
                <br />
                {welcomeEmphasis && <em>{welcomeEmphasis}</em>}
              </h1>
              {welcomeSubHeading && <p className="circle-p-hero-sub">{welcomeSubHeading}</p>}
            </div>

            <div className="circle-p-drop-strip">
              <div className="circle-p-drop-cell active-p">
                <div className="circle-p-drop-num">Drop 1</div>
                <div className="circle-p-drop-ships">Ships in ~14 Days</div>
                <div className="circle-p-drop-price">$79.99</div>
                <div className="circle-p-drop-tag">Open Now</div>
              </div>
              <div className="circle-p-drop-cell">
                <div className="circle-p-drop-num">Drop 2</div>
                <div className="circle-p-drop-price">$89.99</div>
                <div className="circle-p-drop-tag">Locked</div>
              </div>
              <div className="circle-p-drop-cell">
                <div className="circle-p-drop-num">Public</div>
                <div className="circle-p-drop-price">$99.99</div>
                <div className="circle-p-drop-tag">Locked</div>
              </div>
            </div>

            <div className="circle-p-card">
              <div className="circle-p-card-label" style={{ textAlign: "left" }}>{productHeading}</div>
              <div className="circle-p-slider-track">
                <div className="circle-p-prod active-p">
                  <div className="circle-p-prod-img">👕</div>
                  <div className="circle-p-prod-name">Essential Tee</div>
                  <div className="circle-p-prod-status">Ships in ~14 days</div>
                </div>
                <div className="circle-p-prod">
                  <div className="circle-p-prod-img">👖</div>
                  <div className="circle-p-prod-name">Cargo Pants</div>
                  <div className="circle-p-prod-status">Tap to view →</div>
                </div>
              </div>
            </div>

            <div className="circle-p-action-block">
              <div className="circle-p-action-eyebrow">Drop 1 — Early Bird</div>

              <div className="circle-p-countdown-wrap">
                <div className="circle-p-countdown-label">Ends in</div>
                <div className="circle-p-countdown">
                  <div className="circle-p-t-block">
                    <span className="circle-p-t-num">01</span>
                    <span className="circle-p-t-lbl">Days</span>
                  </div>
                  <span className="circle-p-t-sep">:</span>
                  <div className="circle-p-t-block">
                    <span className="circle-p-t-num">14</span>
                    <span className="circle-p-t-lbl">Hrs</span>
                  </div>
                  <span className="circle-p-t-sep">:</span>
                  <div className="circle-p-t-block">
                    <span className="circle-p-t-num">35</span>
                    <span className="circle-p-t-lbl">Min</span>
                  </div>
                </div>
              </div>

              <div className="circle-p-price-block">
                <div className="circle-p-price-main">
                  <div className="circle-p-price-context">Your price today</div>
                  <div className="circle-p-price-amount">$79.99</div>
                </div>
                <div className="circle-p-price-future">
                  <div className="circle-p-price-context">Public Release</div>
                  <div className="circle-p-price-was">$99.99</div>
                </div>
              </div>

              <button type="button" className="circle-p-cta-btn">
                {reserveButtonText}
              </button>

              <div className="circle-p-cta-meta">
                <p>Arrives Within ~14 Days</p>
                <p>Free Shipping</p>
              </div>
            </div>

            <div className="circle-p-locked-rows-wrapper">
              <div className="circle-p-locked-row">
                <div className="circle-p-locked-left">
                  <div className="circle-p-locked-eyebrow">Drop 2 — Opens after Drop 1</div>
                  <div className="circle-p-locked-title">Second Release</div>
                </div>
                <div className="circle-p-locked-right">
                  <div className="circle-p-locked-price-amount">$89.99</div>
                  <div className="circle-p-locked-when">Ships in ~30 days</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TABS = ["Content", "Typography", "Colors", "Layout", "Custom Code", "Live Preview"];

  return (
    <s-page heading="Theme Customization">
      <s-button slot="primary-action" variant="primary" onClick={handleSave}>
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

        {/* Content tab */}
        {activeTab === 0 && (
          <s-section heading="Widget Content Labels">
            <s-stack direction="block" gap="large">
              <s-text-field label="Badge Text" value={badgeText} onChange={(e: any) => setBadgeText(e.currentTarget.value)} />
              <s-text-field label="Countdown Text" value={countdownText} onChange={(e: any) => setCountdownText(e.currentTarget.value)} />
              <s-text-field label="Stage Label Text" value={stageLabelText} onChange={(e: any) => setStageLabelText(e.currentTarget.value)} />
              <s-text-field label="Member Pill Label" value={memberLabel} onChange={(e: any) => setMemberLabel(e.currentTarget.value)} />
              <s-text-field label="Welcome Heading" value={welcomeHeading} onChange={(e: any) => setWelcomeHeading(e.currentTarget.value)} />
              <s-text-field label="Welcome Emphasis Text" value={welcomeEmphasis} onChange={(e: any) => setWelcomeEmphasis(e.currentTarget.value)} />
              <s-text-field label="Welcome Sub-Heading" value={welcomeSubHeading} onChange={(e: any) => setWelcomeSubHeading(e.currentTarget.value)} />
              <s-text-field label="Product Section Heading" value={productHeading} onChange={(e: any) => setProductHeading(e.currentTarget.value)} />
              <s-text-field label="Reserve Button Text" value={reserveButtonText} onChange={(e: any) => setReserveButtonText(e.currentTarget.value)} />
              <s-select label="Reserve Button Click Action" value={buttonAction} onChange={(e: any) => setButtonAction(e.currentTarget.value)}>
                <s-option value="cart">Add to Cart</s-option>
                <s-option value="checkout">Direct Checkout</s-option>
              </s-select>
            </s-stack>
          </s-section>
        )}

        {/* Typography tab */}
        {activeTab === 1 && (
          <s-section heading="Typography">
            <s-stack direction="block" gap="large">
              <s-number-field
                label="Font Size (px)"
                value={fontSize.toString()}
                min={10}
                max={24}
                onChange={(e: any) => setFontSize(Number(e.currentTarget.value))}
              />
              <s-select label="Font Weight" value={fontWeight} onChange={(e: any) => setFontWeight(e.currentTarget.value)}>
                <s-option value="400">Normal (400)</s-option>
                <s-option value="500">Medium (500)</s-option>
                <s-option value="600">Semi-Bold (600)</s-option>
                <s-option value="700">Bold (700)</s-option>
              </s-select>
            </s-stack>
          </s-section>
        )}

        {/* Colors tab */}
        {activeTab === 2 && (
          <s-section heading="Colors">
            <s-grid gridTemplateColumns="1fr 1fr" gap="large">
              <s-color-field label="Sale Price Color" value={salePriceColor} onChange={(e: any) => setSalePriceColor(e.currentTarget.value)} />
              <s-color-field label="Original Price Color" value={originalPriceColor} onChange={(e: any) => setOriginalPriceColor(e.currentTarget.value)} />
              <s-color-field label="Badge Background" value={badgeBg} onChange={(e: any) => setBadgeBg(e.currentTarget.value)} />
              <s-color-field label="Badge Text Color" value={badgeTextColor} onChange={(e: any) => setBadgeTextColor(e.currentTarget.value)} />
              <s-color-field label="Background Color" value={bgColor} onChange={(e: any) => setBgColor(e.currentTarget.value)} />
              <s-color-field label="Text Color" value={textColor} onChange={(e: any) => setTextColor(e.currentTarget.value)} />
              <s-color-field label="Border Color" value={borderColor} onChange={(e: any) => setBorderColor(e.currentTarget.value)} />
              <s-color-field label="Card Background Color" value={cardColor} onChange={(e: any) => setCardColor(e.currentTarget.value)} />
              <s-color-field label="Accent Color" value={accentColor} onChange={(e: any) => setAccentColor(e.currentTarget.value)} />
              <s-color-field label="Muted Text Color" value={mutedColor} onChange={(e: any) => setMutedColor(e.currentTarget.value)} />
            </s-grid>
          </s-section>
        )}

        {/* Layout tab */}
        {activeTab === 3 && (
          <s-section heading="Layout">
            <s-stack direction="block" gap="large">
              <s-number-field label="Card Inner Padding (px)" value={padding.toString()} min={4} max={32} onChange={(e: any) => setPadding(Number(e.currentTarget.value))} />
              <s-number-field label="Padding Top (px)" value={paddingTop.toString()} min={10} max={100} onChange={(e: any) => setPaddingTop(Number(e.currentTarget.value))} />
              <s-number-field label="Padding Bottom (px)" value={paddingBottom.toString()} min={10} max={100} onChange={(e: any) => setPaddingBottom(Number(e.currentTarget.value))} />
              <s-number-field label="Max Width (px)" value={maxWidth.toString()} min={320} max={1200} step={10} onChange={(e: any) => setMaxWidth(Number(e.currentTarget.value))} />
              <s-number-field label="Border Radius (px)" value={borderRadius.toString()} min={0} max={24} onChange={(e: any) => setBorderRadius(Number(e.currentTarget.value))} />
              <s-select label="Alignment" value={alignment} onChange={(e: any) => setAlignment(e.currentTarget.value)}>
                <s-option value="left">Left</s-option>
                <s-option value="center">Center</s-option>
                <s-option value="right">Right</s-option>
              </s-select>
              <s-select
                label="Products Per View (Slider)"
                value={sliderItems.toString()}
                onChange={(e: any) => setSliderItems(Number(e.currentTarget.value))}
              >
                <s-option value="2">2 Products</s-option>
                <s-option value="3">3 Products</s-option>
                <s-option value="4">4 Products</s-option>
                <s-option value="5">5 Products</s-option>
                <s-option value="6">6 Products</s-option>
              </s-select>
            </s-stack>
          </s-section>
        )}

        {/* Custom Code tab */}
        {activeTab === 4 && (
          <s-section heading="Custom JavaScript & CSS">
            <s-stack direction="block" gap="large">
              <s-select label="Cart Action Mode" value={cartMode} onChange={(e: any) => setCartMode(e.currentTarget.value)}>
                <s-option value="stay">Stay on Page (AJAX / Dispatch Cart Update)</s-option>
                <s-option value="cart">Redirect to Cart Page</s-option>
                <s-option value="checkout">Redirect to Checkout</s-option>
              </s-select>

              <s-text-area
                label="Custom Add-to-Cart JS Override"
                details="Receives (variantId, quantity, context). context has { variantId, quantity, form }. Overrides default action if return/execution succeeds."
                rows={6}
                value={customJs}
                onChange={(e: any) => setCustomJs(e.currentTarget.value)}
              />

              <s-text-area
                label="Custom CSS Styles"
                details="Custom CSS rules will be injected directly into the storefront showcase widget."
                rows={6}
                value={customCss}
                onChange={(e: any) => setCustomCss(e.currentTarget.value)}
              />
            </s-stack>
          </s-section>
        )}

        {/* Live Preview tab — only place the storefront preview renders */}
        {activeTab === 5 && (
          <s-section heading="Live Storefront Preview">
            <s-stack direction="block" gap="large">
              <s-text tone="neutral">
                Below is a preview of how the discount widget renders on your store using the current settings.
              </s-text>
              {renderLivePreview()}
            </s-stack>
          </s-section>
        )}
      </s-stack>
    </s-page>
  );
}
