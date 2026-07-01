(function() {
  document.addEventListener("DOMContentLoaded", function() {
    const container = document.querySelector(".discount-showcase-container");
    if (!container) return;

    const shop = container.getAttribute("data-shop");
    const campaignId = container.getAttribute("data-campaign-id");
    const blockId = container.getAttribute("data-block-id");
    const buttonAction = container.getAttribute("data-button-action") || "cart";

    const offerContent = document.getElementById(`circle-offer-content-${blockId}`);
    const fallbackLoader = document.getElementById(`discount-showcase-loading-${blockId}`);

    let activeCampaignDetails = null;
    let selectedProduct = null;
    let selectedVariant = null;
    let productDetailsCache = {};

    // 1. Fetch campaign data via App Proxy
    let fetchUrl = `/apps/discount-showcase/products?shop=${shop}`;
    if (campaignId && campaignId !== "active") {
      fetchUrl += `&campaignId=${campaignId}`;
    }

    fetch(fetchUrl)
      .then(res => res.json())
      .then(data => {
        if (data.error || !data.products || data.products.length === 0) {
          if (fallbackLoader) {
            fallbackLoader.innerHTML = '<div class="discount-showcase-loading">No active promotional campaigns at this time.</div>';
          }
          return;
        }

        activeCampaignDetails = data;
        initShowcase();
      })
      .catch(err => {
        console.error("Error loading discount showcase:", err);
        if (fallbackLoader) {
          fallbackLoader.innerHTML = '<div class="discount-showcase-loading">Unable to load promotions. Please try again later.</div>';
        }
      });

    // ── MAIN INITIALIZER ──
    function initShowcase() {
      const data = activeCampaignDetails;
      const stages = data.stages || [];
      const products = data.products || [];

      // Determine currently active stage
      const now = new Date();
      const activeStage = stages.find(s => new Date(s.startDate) <= now && new Date(s.endDate) >= now) || stages[0];
      const activePhaseNum = activeStage ? activeStage.stageNumber : 1;

      // Show container content, hide loading
      if (fallbackLoader) fallbackLoader.style.display = "none";
      if (offerContent) offerContent.style.display = "block";

      // Update live line status text
      const liveTextEl = container.querySelector("[data-live-status-text]");
      if (liveTextEl && activeStage) {
        liveTextEl.innerText = `${activeStage.label} open now`;
      }

      // Initialize with first product
      selectedProduct = products[0];

      // ── RENDER DROP STRIP ──
      renderDropStrip(stages, activePhaseNum);

      // ── RENDER PRODUCTS LIST ──
      renderProductsList(products, activePhaseNum);

      // ── START TIMER ──
      if (activeStage) {
        startCountdown(activeStage.endDate);
      }

      // ── RENDER LOCKED ROWS ──
      renderLockedRows(stages, activePhaseNum);

      // Select default product
      selectProduct(products[0].id);

      // Bind Slider Arrow Navigation
      setupSliderNavigation();

      // Bind Modals Close
      setupModals();
    }

    // ── RENDER DROP STRIP CELLS ──
    function renderDropStrip(stages, activePhaseNum) {
      const stripContainer = container.querySelector("[data-drop-strip]");
      if (!stripContainer) return;

      let hasPhase3 = container.getAttribute("data-has-phase-3") === "true";
      
      let html = "";
      stages.forEach((stage, idx) => {
        const isCurrent = stage.stageNumber === activePhaseNum;
        const isPast = stage.stageNumber < activePhaseNum;
        
        let cellClass = "circle-drop-cell";
        if (isCurrent) cellClass += " active-drop";
        else cellClass += " locked";

        if (stage.stageNumber === 3) {
          cellClass += " public-release";
        } else {
          cellClass += ` phase-${stage.stageNumber}`;
        }

        let shipDays = stage.stageNumber === 1 ? "~14 Days" : stage.stageNumber === 2 ? "~30 Days" : "~60 Days";
        let statusTag = isCurrent ? "Open Now" : isPast ? "Closed" : "Locked";

        html += `
          <div class="${cellClass}" data-strip-cell="${stage.stageNumber}">
            <div class="circle-drop-num">${stage.label}</div>
            ${isCurrent ? `<div class="circle-drop-ships">Ships in ${shipDays}</div>` : ''}
            <div class="circle-drop-price" data-strip-price="${stage.stageNumber}">—</div>
            <div class="circle-drop-tag">${statusTag}</div>
          </div>
        `;
      });

      stripContainer.innerHTML = html;
    }

    // ── RENDER PRODUCTS SLIDER ──
    function renderProductsList(products, activePhaseNum) {
      const track = container.querySelector("[data-slider-track]");
      if (!track) return;

      let html = "";
      products.forEach((prod, idx) => {
        let shipText = activePhaseNum === 1 ? "Ships in ~14 days" : activePhaseNum === 2 ? "Ships in ~30 days" : "Ships in ~60 days";
        
        html += `
          <div class="circle-prod" data-product-id="${prod.id}" data-handle="${prod.handle}">
            <div class="circle-prod-img">
              <span class="circle-prod-dot"></span>
              <img src="${prod.image || 'https://cdn.shopify.com/s/images/admin/no-image-large.gif'}" alt="${prod.title}" loading="lazy">
            </div>
            <div class="circle-prod-info">
              <div class="circle-prod-name">${prod.title}</div>
            </div>
            <div class="prod-status-wrapper">
              <div class="prod-status status-active" style="display:none;">Tap to view →</div>
              <div class="prod-status status-shipping">${shipText}</div>
            </div>
          </div>
        `;
      });

      track.innerHTML = html;

      // Bind Product Item Click events
      container.querySelectorAll(".circle-prod").forEach(el => {
        el.addEventListener("click", function() {
          const prodId = this.getAttribute("data-product-id");
          selectProduct(prodId);
        });

        // Double click to open popup modal directly
        el.addEventListener("dblclick", function() {
          openProductModal();
        });
      });
    }

    // ── SELECT PRODUCT STATE ──
    function selectProduct(prodId) {
      const products = activeCampaignDetails.products || [];
      const prod = products.find(p => p.id === prodId);
      if (!prod) return;

      selectedProduct = prod;

      // Toggle active CSS class in slider list
      container.querySelectorAll(".circle-prod").forEach(el => {
        if (el.getAttribute("data-product-id") === prodId) {
          el.classList.add("active");
          el.querySelector(".status-active").style.display = "block";
          el.querySelector(".status-shipping").style.display = "none";
        } else {
          el.classList.remove("active");
          el.querySelector(".status-active").style.display = "none";
          el.querySelector(".status-shipping").style.display = "block";
        }
      });

      // Update phase strip pricing display based on this product's price
      const stages = activeCampaignDetails.stages || [];
      stages.forEach(stage => {
        const priceEl = container.querySelector(`[data-strip-price="${stage.stageNumber}"]`);
        if (priceEl) {
          let stagePrice = calculatePrice(prod.originalPrice, stage.discountValue);
          priceEl.innerText = formatMoney(stagePrice);
        }
      });

      // Fetch options / variant details from Shopify
      fetchStorefrontProductDetails(prod.handle);
    }

    // ── FETCH / CACHE STOREFRONT PRODUCT JSON ──
    function fetchStorefrontProductDetails(handle) {
      if (productDetailsCache[handle]) {
        populateProductOptions(productDetailsCache[handle]);
        return;
      }

      fetch(`/products/${handle}.js`)
        .then(res => res.json())
        .then(details => {
          productDetailsCache[handle] = details;
          populateProductOptions(details);
        })
        .catch(err => {
          console.error("Error fetching storefront options:", err);
        });
    }

    // ── POPULATE OPTION SWATCHES ──
    function populateProductOptions(details) {
      const optionsContainer = container.querySelector("[data-options-container]");
      if (!optionsContainer) return;

      selectedVariant = details.variants[0];

      // Build swatches
      let html = "";
      if (details.options && details.variants.length > 1) {
        details.options.forEach(opt => {
          html += `
            <div class="circle-option-row">
              <label class="circle-option-label">${opt.name}</label>
              <div class="circle-option-swatches">
          `;
          opt.values.forEach(val => {
            const isSelected = selectedVariant.options.includes(val);
            html += `
              <button type="button" class="circle-swatch ${isSelected ? 'active' : ''}" data-option-name="${opt.name}" data-option-value="${val}">
                ${val}
              </button>
            `;
          });
          html += `
              </div>
            </div>
          `;
        });

        // Add size guide link if option name is "size" or similar
        const hasSize = details.options.some(o => o.name.toLowerCase().includes("size"));
        if (hasSize) {
          html += `
            <div style="margin-top:10px; text-align:right;">
              <button type="button" class="circle-size-guide-trigger" id="size-guide-trigger-${blockId}">
                Size Guide
              </button>
            </div>
          `;
        }
      }

      optionsContainer.innerHTML = html;

      // Bind option swatch click event
      optionsContainer.querySelectorAll(".circle-swatch").forEach(swatch => {
        swatch.addEventListener("click", function() {
          const optName = this.getAttribute("data-option-name");
          const optVal = this.getAttribute("data-option-value");

          // Update active swatch
          this.parentNode.querySelectorAll(".circle-swatch").forEach(s => s.classList.remove("active"));
          this.classList.add("active");

          // Find match variant
          const selectedOptions = Array.from(optionsContainer.querySelectorAll(".circle-swatch.active")).map(s => s.getAttribute("data-option-value"));
          const match = details.variants.find(v => {
            return selectedOptions.every(opt => v.options.includes(opt));
          });

          if (match) {
            selectedVariant = match;
            updatePricesBlock();
          }
        });
      });

      // Bind size guide modal popup trigger
      const sgTrigger = document.getElementById(`size-guide-trigger-${blockId}`);
      if (sgTrigger) {
        sgTrigger.addEventListener("click", () => {
          document.getElementById(`circle-size-modal-${blockId}`).style.display = "flex";
        });
      }

      updatePricesBlock();
    }

    // ── UPDATE RESERVATION BLOCK VALUES ──
    function updatePricesBlock() {
      if (!selectedProduct || !selectedVariant) return;

      const stages = activeCampaignDetails.stages || [];
      const now = new Date();
      const activeStage = stages.find(s => new Date(s.startDate) <= now && new Date(s.endDate) >= now) || stages[0];

      // Calc prices
      let salePrice = calculatePrice(selectedVariant.price / 100, activeStage.discountValue);
      let comparePrice = selectedVariant.price / 100;

      // Update elements
      const saleEl = container.querySelector("[data-preview-sale-price]");
      const wasEl = container.querySelector("[data-preview-compare-price]");
      const actionBlock = container.querySelector("[data-action-block]");
      const actionEyebrow = container.querySelector("[data-action-eyebrow]");
      const metaEl = container.querySelector("[data-cta-meta]");

      if (saleEl) saleEl.innerText = formatMoney(salePrice);
      if (wasEl) wasEl.innerText = formatMoney(comparePrice);

      if (actionEyebrow && activeStage) {
        actionEyebrow.innerText = `${activeStage.label} — ${activeStage.phaseTitle || 'Active members offer'}`;
      }

      if (metaEl && activeStage) {
        metaEl.innerHTML = `
          <p>${activeStage.shippingNoteLeft || ''}</p>
          <p>${activeStage.shippingNoteRight || ''}</p>
        `;
      }

      // Bind reserve CTA click
      const reserveBtn = container.querySelector("[data-reserve-main]");
      if (reserveBtn) {
        reserveBtn.onclick = function() {
          addToCart(selectedVariant.id, 1);
        };
      }
    }

    // ── COUNTDOWN TIMER ──
    let countdownInterval = null;
    function startCountdown(endDateStr) {
      if (countdownInterval) clearInterval(countdownInterval);

      const endMs = new Date(endDateStr).getTime();

      const daysEl = container.querySelector("[data-days]");
      const hoursEl = container.querySelector("[data-hours]");
      const minsEl = container.querySelector("[data-minutes]");
      const secsEl = container.querySelector("[data-seconds]");

      function updateTimer() {
        const diff = endMs - Date.now();
        if (diff <= 0) {
          clearInterval(countdownInterval);
          if (daysEl) daysEl.innerText = "00";
          if (hoursEl) hoursEl.innerText = "00";
          if (minsEl) minsEl.innerText = "00";
          if (secsEl) secsEl.innerText = "00";
          return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / (1000 * 60)) % 60);
        const s = Math.floor((diff / 100) % 60); // 100ms multiplier for smoothness or regular s

        const sFull = Math.floor((diff / 1000) % 60);

        if (daysEl) daysEl.innerText = String(d).padStart(2, "0");
        if (hoursEl) hoursEl.innerText = String(h).padStart(2, "0");
        if (minsEl) minsEl.innerText = String(m).padStart(2, "0");
        if (secsEl) secsEl.innerText = String(sFull).padStart(2, "0");
      }

      updateTimer();
      countdownInterval = setInterval(updateTimer, 1000);
    }

    // ── RENDER LOCKED NEXT STAGES ROWS ──
    function renderLockedRows(stages, activePhaseNum) {
      const wrapper = container.querySelector("[data-locked-rows-wrapper]");
      if (!wrapper) return;

      let html = "";
      stages.forEach(stage => {
        // Only render stages in the future (stageNumber > activePhaseNum)
        if (stage.stageNumber > activePhaseNum) {
          let shipDays = stage.stageNumber === 2 ? "Ships in ~30–40 days" : "Ships in ~50–60 days";
          let eyebrow = stage.stageNumber === 2 ? "Drop 2 — Opens after Drop 1" : "Public release — Coming soon";
          
          html += `
            <div class="circle-locked-row">
              <div class="circle-locked-left">
                <div class="circle-locked-eyebrow">${eyebrow}</div>
                <div class="circle-locked-title">${stage.phaseTitle || stage.label}</div>
              </div>
              <div class="circle-locked-right">
                <div class="circle-locked-price-wrapper">
                  <span class="circle-locked-price-amount" data-locked-stage-price="${stage.stageNumber}">—</span>
                </div>
                <div class="locked-when">${shipDays}</div>
              </div>
            </div>
          `;
        }
      });

      wrapper.innerHTML = html;

      // Update prices on locked cells
      stages.forEach(stage => {
        if (stage.stageNumber > activePhaseNum) {
          const lockedPriceEl = wrapper.querySelector(`[data-locked-stage-price="${stage.stageNumber}"]`);
          if (lockedPriceEl && selectedProduct) {
            let p = calculatePrice(selectedProduct.originalPrice, stage.discountValue);
            lockedPriceEl.innerText = formatMoney(p);
          }
        }
      });
    }

    // ── POPUP PRODUCT DETAILS MODAL ──
    function openProductModal() {
      const modal = document.getElementById(`circle-product-modal-${blockId}`);
      if (!modal || !selectedProduct) return;

      modal.style.display = "flex";

      // Reset fields
      const details = productDetailsCache[selectedProduct.handle];
      if (!details) return;

      modal.querySelector("[data-modal-title]").innerText = details.title;
      modal.querySelector("[data-modal-desc]").innerHTML = details.description;

      // Gallery Images Injected
      const track = modal.querySelector("[data-modal-img-track]");
      const dotsContainer = modal.querySelector("[data-modal-img-dots]");
      
      let imgHtml = "";
      let dotsHtml = "";
      
      details.images.forEach((img, index) => {
        imgHtml += `<img src="${img}" alt="${details.title} Image ${index+1}" class="circle-modal-img-slide" data-slide-index="${index}">`;
        dotsHtml += `<span class="circle-gallery-dot ${index === 0 ? 'active' : ''}" data-dot-index="${index}"></span>`;
      });
      
      if (track) track.innerHTML = imgHtml;
      if (dotsContainer) dotsContainer.innerHTML = dotsHtml;

      // Slider logic in modal gallery
      let currentSlide = 0;
      const slides = modal.querySelectorAll(".circle-modal-img-slide");
      const dots = modal.querySelectorAll(".circle-gallery-dot");
      const prevBtn = modal.querySelector("[data-modal-img-prev]");
      const nextBtn = modal.querySelector("[data-modal-img-next]");

      if (slides.length > 1) {
        if (prevBtn) prevBtn.style.display = "block";
        if (nextBtn) nextBtn.style.display = "block";
      } else {
        if (prevBtn) prevBtn.style.display = "none";
        if (nextBtn) nextBtn.style.display = "none";
      }

      function showSlide(index) {
        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;
        currentSlide = index;

        if (track) {
          track.style.transform = `translateX(-${currentSlide * 100}%)`;
        }

        dots.forEach(d => d.classList.remove("active"));
        if (dots[currentSlide]) dots[currentSlide].classList.add("active");
      }

      if (prevBtn) {
        prevBtn.onclick = function() { showSlide(currentSlide - 1); };
      }
      if (nextBtn) {
        nextBtn.onclick = function() { showSlide(currentSlide + 1); };
      }

      dots.forEach(dot => {
        dot.onclick = function() {
          showSlide(parseInt(this.getAttribute("data-dot-index")));
        };
      });

      // Populate Modal swatches options
      const modalOptions = modal.querySelector("[data-modal-options]");
      if (modalOptions) {
        let optHtml = "";
        if (details.options && details.variants.length > 1) {
          details.options.forEach(opt => {
            optHtml += `
              <div class="circle-option-row">
                <label class="circle-option-label">${opt.name}</label>
                <div class="circle-option-swatches">
            `;
            opt.values.forEach(val => {
              const isSelected = selectedVariant.options.includes(val);
              optHtml += `
                <button type="button" class="circle-swatch-modal ${isSelected ? 'active' : ''}" data-modal-opt-name="${opt.name}" data-modal-opt-value="${val}">
                  ${val}
                </button>
              `;
            });
            optHtml += `
                </div>
              </div>
            `;
          });
        }
        modalOptions.innerHTML = optHtml;

        // Swatch clicks inside Modal
        modalOptions.querySelectorAll(".circle-swatch-modal").forEach(swatch => {
          swatch.addEventListener("click", function() {
            const optName = this.getAttribute("data-modal-opt-name");
            const optVal = this.getAttribute("data-modal-opt-value");

            this.parentNode.querySelectorAll(".circle-swatch-modal").forEach(s => s.classList.remove("active"));
            this.classList.add("active");

            // Find variant
            const selectedOptions = Array.from(modalOptions.querySelectorAll(".circle-swatch-modal.active")).map(s => s.getAttribute("data-modal-opt-value"));
            const match = details.variants.find(v => {
              return selectedOptions.every(opt => v.options.includes(opt));
            });

            if (match) {
              selectedVariant = match;
              updateModalPrices();
            }
          });
        });
      }

      updateModalPrices();

      // Bind Modal Add to Cart
      const modalCartBtn = document.getElementById(`modal-add-to-cart-${blockId}`);
      if (modalCartBtn) {
        modalCartBtn.onclick = function() {
          const qty = parseInt(document.getElementById(`modal-qty-${blockId}`).value) || 1;
          addToCart(selectedVariant.id, qty);
        };
      }
    }

    // ── UPDATE PRICES ON PRODUCT DETAILS POPUP MODAL ──
    function updateModalPrices() {
      const modal = document.getElementById(`circle-product-modal-${blockId}`);
      if (!modal || !selectedVariant) return;

      const stages = activeCampaignDetails.stages || [];
      const now = new Date();
      const activeStage = stages.find(s => new Date(s.startDate) <= now && new Date(s.endDate) >= now) || stages[0];

      let salePrice = calculatePrice(selectedVariant.price / 100, activeStage.discountValue);
      let comparePrice = selectedVariant.price / 100;

      const saleEl = modal.querySelector("[data-modal-sale]");
      const wasEl = modal.querySelector("[data-modal-was]");
      const exclusiveTextEl = modal.querySelector("[data-modal-shipping-text]");

      if (saleEl) saleEl.innerText = formatMoney(salePrice);
      if (wasEl) wasEl.innerText = formatMoney(comparePrice);

      if (exclusiveTextEl && activeStage) {
        let shipDays = activeStage.stageNumber === 1 ? "~14 days" : activeStage.stageNumber === 2 ? "~30 days" : "~60 days";
        exclusiveTextEl.innerText = `In your hands in ${shipDays}`;
      }
    }

    // ── ADD TO CART FUNCTION ──
    function addToCart(variantId, quantity) {
      const buttons = document.querySelectorAll(`.circle-cta-btn`);
      buttons.forEach(btn => {
        btn.innerText = "Reserving...";
        btn.disabled = true;
      });

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: variantId, quantity: quantity }]
        })
      })
      .then(res => res.json())
      .then(cartData => {
        // If there is an active discount code, redirect to auto-apply discount url
        if (activeCampaignDetails && activeCampaignDetails.discountCode) {
          const code = activeCampaignDetails.discountCode;
          if (activeCampaignDetails.autoApply) {
            window.location.href = `/discount/${encodeURIComponent(code)}?redirect=/checkout`;
            return;
          }
        }
        
        if (buttonAction === "checkout") {
          window.location.href = "/checkout";
        } else {
          window.location.href = "/cart";
        }
      })
      .catch(err => {
        console.error("Cart Reservation Error:", err);
        alert("Unable to reserve product. Please check stock and try again.");
      })
      .finally(() => {
        buttons.forEach(btn => {
          btn.innerText = container.getAttribute("data-reserve-button-text") || "Reserve Now";
          btn.disabled = false;
        });
      });
    }

    // ── SLIDER INTERACTION / SCROLLING ──
    function setupSliderNavigation() {
      const viewport = container.querySelector("[data-slider-viewport]");
      const track = container.querySelector("[data-slider-track]");
      const prevBtn = container.querySelector("[data-arrow='prev']");
      const nextBtn = container.querySelector("[data-arrow='next']");
      
      if (!viewport || !track) return;

      function updateArrows() {
        if (prevBtn) prevBtn.disabled = viewport.scrollLeft <= 0;
        if (nextBtn) nextBtn.disabled = viewport.scrollLeft + viewport.clientWidth >= track.scrollWidth - 5;
      }

      if (prevBtn) {
        prevBtn.addEventListener("click", () => {
          viewport.scrollBy({ left: -220, behavior: "smooth" });
          setTimeout(updateArrows, 300);
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          viewport.scrollBy({ left: 220, behavior: "smooth" });
          setTimeout(updateArrows, 300);
        });
      }

      viewport.addEventListener("scroll", updateArrows);
      window.addEventListener("resize", updateArrows);
      setTimeout(updateArrows, 500);
    }

    // ── MODAL TOGGLES & BINDINGS ──
    function setupModals() {
      const prodModal = document.getElementById(`circle-product-modal-${blockId}`);
      const closeProdBtn = document.getElementById(`circle-modal-close-${blockId}`);

      const sizeModal = document.getElementById(`circle-size-modal-${blockId}`);
      const closeSizeBtn = document.getElementById(`circle-size-close-${blockId}`);

      // Open detail trigger binding inside swatches list (see swatch creation)
      if (closeProdBtn) {
        closeProdBtn.addEventListener("click", () => {
          if (prodModal) prodModal.style.display = "none";
        });
      }

      if (closeSizeBtn) {
        closeSizeBtn.addEventListener("click", () => {
          if (sizeModal) sizeModal.style.display = "none";
        });
      }

      // Close on clicking overlay background
      window.addEventListener("click", (e) => {
        if (e.target === prodModal) {
          prodModal.style.display = "none";
        }
        if (e.target === sizeModal) {
          sizeModal.style.display = "none";
        }
      });

      // Size unit guide toggling (cm / inches)
      const btnCm = document.getElementById(`size-btn-cm-${blockId}`);
      const btnIn = document.getElementById(`size-btn-in-${blockId}`);
      const label = document.getElementById(`size-unit-label-${blockId}`);
      const cells = document.querySelectorAll(`.sz-cell-${blockId}`);

      if (btnCm && btnIn) {
        btnCm.addEventListener("click", () => {
          btnCm.className = "active";
          btnIn.className = "inactive";
          if (label) label.innerText = "centimetres (cm)";
          cells.forEach(c => {
            const cmVal = c.getAttribute("data-cm");
            c.innerText = cmVal;
          });
        });

        btnIn.addEventListener("click", () => {
          btnCm.className = "inactive";
          btnIn.className = "active";
          if (label) label.innerText = "inches (in)";
          cells.forEach(c => {
            const inVal = c.getAttribute("data-in");
            c.innerText = inVal;
          });
        });
      }
    }

    // ── HELPERS ──
    function calculatePrice(originalPrice, discountValue) {
      const discountType = activeCampaignDetails.discountType;
      if (discountType === "PERCENTAGE") {
        return originalPrice * (1 - discountValue / 100);
      } else {
        // Direct Override
        return discountValue;
      }
    }

    function formatMoney(amount) {
      return "$" + parseFloat(amount).toFixed(2);
    }
  });
})();
