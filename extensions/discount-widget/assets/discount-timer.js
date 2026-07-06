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
            // Product is not under an active campaign
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

      // 1. Find product details inside returned data to grab its original price
      // In proxy, we return products mapping matching the variant snapshots. Let's find one.
      const resolvedProduct = data.products && data.products[0];
      const originalPrice = resolvedProduct ? parseFloat(resolvedProduct.originalPrice) : parseFloat(container.getAttribute("data-product-price") || "0");

      if (isNaN(originalPrice) || originalPrice <= 0) return;

      // 2. Apply Custom styling properties
      container.style.setProperty('--dt-bg-color', settings.bgColor || '#f0efeb');
      container.style.setProperty('--dt-text-color', settings.textColor || '#0e0e0d');
      container.style.setProperty('--dt-border-color', settings.borderColor || '#e2dfd9');
      container.style.setProperty('--dt-card-color', settings.cardColor || '#faf9f7');
      container.style.setProperty('--dt-accent-color', settings.accentColor || '#1a3a2a');
      container.style.setProperty('--dt-muted-color', settings.mutedColor || '#9a9792');
      container.style.setProperty('--dt-sale-color', settings.salePriceColor || '#E63946');
      container.style.setProperty('--dt-original-color', settings.originalPriceColor || '#6B7280');
      container.style.setProperty('--dt-border-radius', (settings.borderRadius || 8) + 'px');
      container.style.setProperty('--dt-padding', (settings.padding || 12) + 'px');
      container.style.setProperty('--dt-font-size', (settings.fontSize || 14) + 'px');
      container.style.setProperty('--dt-font-weight', settings.fontWeight || '500');

      // Inject custom styling from settings if any
      if (settings.customCss) {
        let styleTag = document.getElementById('dt-custom-css');
        if (!styleTag) {
          styleTag = document.createElement('style');
          styleTag.id = 'dt-custom-css';
          document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = settings.customCss;
      }

      // 3. Determine active phase by date comparison
      const now = new Date();
      const activeStage = stages.find(s => new Date(s.startDate) <= now && new Date(s.endDate) >= now) || stages[0];
      const activePhaseNum = activeStage ? activeStage.stageNumber : 1;

      // 4. Generate the HTML structure for multi-stage dropdown timeline
      let html = `<div class="dt-timeline-wrapper">`;

      // --- PHASE 1 (OR CURRENT ACTIVE PHASE) ---
      if (activeStage) {
        const activeSalePrice = calculatePrice(originalPrice, activeStage.discountValue, discountType);
        
        html += `
          <div class="dt-phase-card active-phase">
            <div class="dt-phase-header">
              <span class="dt-phase-dot animate-glow"></span>
              <span class="dt-phase-heading">${activeStage.label || 'Drop ' + activeStage.stageNumber}</span>
              <span class="dt-phase-badge">Open Now</span>
            </div>
            
            <div class="dt-price-row">
              <span class="dt-sale-price">${formatMoney(activeSalePrice, moneyFormat)}</span>
              <span class="dt-original-price">${formatMoney(originalPrice, moneyFormat)}</span>
            </div>

            <div class="dt-timer-wrapper">
              <div class="dt-timer-label">Ends in:</div>
              <div class="dt-timer-countdown" data-dt-countdown="${activeStage.endDate}">
                <div class="dt-time-block"><span class="dt-time-val" data-days>00</span><span class="dt-time-unit">d</span></div>
                <span class="dt-time-sep">:</span>
                <div class="dt-time-block"><span class="dt-time-val" data-hours>00</span><span class="dt-time-unit">h</span></div>
                <span class="dt-time-sep">:</span>
                <div class="dt-time-block"><span class="dt-time-val" data-mins>00</span><span class="dt-time-unit">m</span></div>
                <span class="dt-time-sep">:</span>
                <div class="dt-time-block"><span class="dt-time-val" data-secs>00</span><span class="dt-time-unit">s</span></div>
              </div>
            </div>
          </div>
        `;
      }

      // --- FUTURE PHASES (DROP 2, DROP 3, ETC.) ---
      stages.forEach(stage => {
        if (stage.stageNumber > activePhaseNum) {
          const upcomingSalePrice = calculatePrice(originalPrice, stage.discountValue, discountType);
          const prevStageLabel = stages.find(s => s.stageNumber === stage.stageNumber - 1)?.label || `Drop ${stage.stageNumber - 1}`;
          
          html += `
            <div class="dt-phase-card upcoming-phase">
              <div class="dt-phase-header">
                <span class="dt-upcoming-label">${stage.label || 'Drop ' + stage.stageNumber} Opens after ${prevStageLabel}</span>
              </div>
              <div class="dt-upcoming-details">
                <span class="dt-upcoming-title">${stage.phaseTitle || 'Next Release'}</span>
                <span class="dt-upcoming-price">${formatMoney(upcomingSalePrice, moneyFormat)}</span>
              </div>
            </div>
          `;
        }
      });

      // --- PUBLIC RELEASE / DEFAULT ORIGINAL PRICE ROW ---
      // We always show this at the end as drop 3 or general public release
      html += `
        <div class="dt-phase-card public-release-phase">
          <div class="dt-phase-header">
            <span class="dt-public-label">Open to the Public</span>
            <span class="dt-public-badge">Regular Release</span>
          </div>
          <div class="dt-public-details">
            <span class="dt-public-title">Public Release</span>
            <span class="dt-public-price">${formatMoney(originalPrice, moneyFormat)}</span>
          </div>
        </div>
      `;

      html += `</div>`;

      container.innerHTML = html;
      container.style.display = "block"; // Make the widget visible

      // 5. Initialize countdown clock
      if (activeStage) {
        setupCountdown(container.querySelector(`[data-dt-countdown]`), activeStage.endDate);
      }
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
