(function() {
  document.addEventListener("DOMContentLoaded", function() {
    const containers = document.querySelectorAll(".discount-timer-container");
    if (containers.length === 0) return;

    containers.forEach(container => {
      const shop = container.getAttribute("data-shop");
      const productId = container.getAttribute("data-product-id");
      const moneyFormat = container.getAttribute("data-money-format") || "${{amount}}";

      if (!shop || !productId) return;

      const fetchUrl = `/apps/discount-showcase/products?shop=${shop}&productId=${productId}`;

      fetch(fetchUrl)
        .then(res => res.json())
        .then(data => {
          if (data.error || !data.stages || data.stages.length === 0) {
            container.style.display = "none";
            return;
          }

          renderTimerWidget(container, data, moneyFormat);
        })
        .catch(err => {
          console.error("Error loading discount timer:", err);
          container.style.display = "none";
        });
    });

    function formatMoney(amountVal, formatStr) {
      let amount = parseFloat(amountVal).toFixed(2);
      return formatStr
        .replace('{{amount}}', amount)
        .replace('{{amount_no_decimals}}', Math.round(amount))
        .replace('{{amount_with_comma_separator}}', amount.replace('.', ','))
        .replace('${amount}', amount);
    }

    function calculatePrice(originalPrice, discountValue, discountType) {
      let price = parseFloat(originalPrice);
      if (discountType === "PERCENTAGE") {
        return price * (1 - parseFloat(discountValue) / 100);
      } else if (discountType === "FIX_AMOUNT") {
        return parseFloat(discountValue);
      }
      return price;
    }

    function renderTimerWidget(container, data, moneyFormat) {
      const stages = data.stages || [];
      const settings = data.settings || {};
      const discountType = data.discountType || "PERCENTAGE";

      const resolvedProduct = data.products && data.products[0];
      const originalPrice = resolvedProduct ? parseFloat(resolvedProduct.originalPrice) : parseFloat(container.getAttribute("data-product-price") || "0");

      if (isNaN(originalPrice) || originalPrice <= 0) return;

      // 1. Resolve configuration strictly from database settings payload
      const config = {
        title: settings.welcomeHeading || "Limited time offer",
        subtitle: settings.countdownText || "Sale ends in:",
        bgColor: settings.bgColor || "#8b5cf6",
        textColor: settings.textColor || "#ffffff",
        cardBgColor: settings.cardColor || "#faf9f7",
        accentColor: settings.accentColor || "#7c3aed",
        mutedColor: settings.mutedColor || "#6b7280",
        borderColor: settings.borderColor || "#e2dfd9",
        salePriceColor: settings.salePriceColor || "#E63946",
        originalPriceColor: settings.originalPriceColor || "#6B7280",
        borderRadius: settings.borderRadius || 16,
        maxWidth: settings.maxWidth || 580,
        paddingTop: settings.paddingTop || 40,
        paddingBottom: settings.paddingBottom || 40,
      };

      // Set CSS Variables for styling
      container.style.setProperty('--dt-bg-color', config.bgColor);
      container.style.setProperty('--dt-bg-gradient', `linear-gradient(135deg, ${config.bgColor}, ${config.accentColor})`);
      container.style.setProperty('--dt-text-color', config.textColor);
      container.style.setProperty('--dt-card-color', config.cardBgColor);
      container.style.setProperty('--dt-accent-color', config.accentColor);
      container.style.setProperty('--dt-muted-color', config.mutedColor);
      container.style.setProperty('--dt-border-color', config.borderColor);
      container.style.setProperty('--dt-sale-color', config.salePriceColor);
      container.style.setProperty('--dt-original-color', config.originalPriceColor);
      container.style.setProperty('--dt-border-radius', config.borderRadius + 'px');
      container.style.setProperty('--dt-max-width', config.maxWidth + 'px');
      container.style.setProperty('--dt-padding-top', config.paddingTop + 'px');
      container.style.setProperty('--dt-padding-bottom', config.paddingBottom + 'px');

      if (settings.customCss) {
        let styleTag = document.getElementById('dt-custom-css');
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'dt-custom-css';
          document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = settings.customCss;
      }

      // 2. Identify Active Stage
      const now = new Date();
      const activeStage = stages.find(s => new Date(s.startDate) <= now && new Date(s.endDate) >= now);
      if (!activeStage) {
        // Hide storefront widget if no campaigns are currently running
        container.style.display = "none";
        return;
      }

      const activePhaseNum = activeStage.stageNumber;

      // Determine next phase dynamic text
      const activeStageIndex = stages.findIndex(s => s.id === activeStage.id);
      const nextStage = stages[activeStageIndex + 1];
      let nextStageText = "";
      if (nextStage) {
        const nextLabel = nextStage.label || `Phase ${nextStage.stageNumber}`;
        nextStageText = `${nextLabel}`;
      } else {
        nextStageText = "Next: Public Release starts when this ends";
      }

      const dynamicSubtitle = `${config.subtitle}`;

      // 3. Generate HTML
      let html = `<div class="dt-timeline-wrapper">`;

      // --- Active Timer Card ---
      html += `
        <div class="dt-active-timer-card">
          <div class="dt-active-timer-title">${config.title}</div>
          <div class="dt-active-timer-subtitle">${dynamicSubtitle}</div>
          
          <div class="dt-active-timer-countdown" data-dt-countdown="${activeStage.endDate}">
            <div class="dt-countdown-col">
              <span class="dt-countdown-num" data-days>00</span>
              <span class="dt-countdown-lbl">Days</span>
            </div>
            <span class="dt-countdown-sep">:</span>
            <div class="dt-countdown-col">
              <span class="dt-countdown-num" data-hours>00</span>
              <span class="dt-countdown-lbl">Hrs</span>
            </div>
            <span class="dt-countdown-sep">:</span>
            <div class="dt-countdown-col">
              <span class="dt-countdown-num" data-mins>00</span>
              <span class="dt-countdown-lbl">Mins</span>
            </div>
            <span class="dt-countdown-sep">:</span>
            <div class="dt-countdown-col">
              <span class="dt-countdown-num" data-secs>00</span>
              <span class="dt-countdown-lbl">Secs</span>
            </div>
          </div>
        </div>
      `;

      // --- Subsequent Drops & Releases List ---
      let listHtml = `<div class="dt-releases-list">`;

      // Loop remaining stages
      stages.forEach(stage => {
        if (stage.stageNumber > activePhaseNum) {
          const upcomingSalePrice = calculatePrice(originalPrice, stage.discountValue, discountType);
          const prevStageLabel = stages.find(s => s.stageNumber === stage.stageNumber - 1)?.label || `Drop ${stage.stageNumber - 1}`;
          
          const eyebrow = stage.shippingNoteLeft || `DROP ${stage.stageNumber} - OPENS AFTER ${prevStageLabel.toUpperCase()}`;
          const title = stage.phaseTitle || stage.label || `Drop ${stage.stageNumber}`;
          const rightPrice = formatMoney(upcomingSalePrice, moneyFormat);
          const rightShipping = stage.shippingNoteRight || `Ships in ~${stage.stageNumber * 15} days`;

          listHtml += `
            <div class="dt-release-row">
              <div class="dt-release-left">
                <div class="dt-release-eyebrow">${eyebrow}</div>
                <div class="dt-release-title">${title}</div>
              </div>
              <div class="dt-release-right">
                <div class="dt-release-price">${rightPrice}</div>
                <div class="dt-release-shipping">${rightShipping}</div>
              </div>
            </div>
          `;
        }
      });

      // Public Release row (originalPrice)
      const publicEyebrow = `DROP ${stages.length + 1} - PUBLIC RELEASE`;
      const publicTitle = "Open To The Public";
      const publicPrice = formatMoney(originalPrice, moneyFormat);
      const publicShipping = settings.publicShipping !== undefined ? settings.publicShipping : "Ships in ~5-7 days";
      let shippingHtml = "";
      if (publicShipping && publicShipping.trim() !== "") {
        shippingHtml = `<div class="dt-release-shipping">${publicShipping}</div>`;
      }

      listHtml += `
        <div class="dt-release-row public-release">
          <div class="dt-release-left">
            <div class="dt-release-eyebrow">${publicEyebrow}</div>
            <div class="dt-release-title">${publicTitle}</div>
          </div>
          <div class="dt-release-right">
            <div class="dt-release-price regular-price">${publicPrice}</div>
            ${shippingHtml}
          </div>
        </div>
      `;

      listHtml += `</div>`;
      html += listHtml;
      html += `</div>`;

      container.innerHTML = html;
      container.style.display = "block";

      // 4. Start the countdown clock
      setupCountdown(container.querySelector(`[data-dt-countdown]`), activeStage.endDate);
    }

    function setupCountdown(element, endDateStr) {
      if (!element) return;

      const endMs = new Date(endDateStr).getTime();
      const daysEl = element.querySelector("[data-days]");
      const hoursEl = element.querySelector("[data-hours]");
      const minsEl = element.querySelector("[data-mins]");
      const secsEl = element.querySelector("[data-secs]");

      function updateClock() {
        const diff = endMs - Date.now();
        if (diff <= 0) {
          if (daysEl) daysEl.innerText = "00";
          if (hoursEl) hoursEl.innerText = "00";
          if (minsEl) minsEl.innerText = "00";
          if (secsEl) secsEl.innerText = "00";
          clearInterval(interval);
          return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / (1000 * 60)) % 60);
        const s = Math.floor((diff / 1000) % 60);

        if (daysEl) daysEl.innerText = String(d).padStart(2, "0");
        if (hoursEl) hoursEl.innerText = String(h).padStart(2, "0");
        if (minsEl) minsEl.innerText = String(m).padStart(2, "0");
        if (secsEl) secsEl.innerText = String(s).padStart(2, "0");
      }

      updateClock();
      const interval = setInterval(updateClock, 1000);
    }
  });
})();
