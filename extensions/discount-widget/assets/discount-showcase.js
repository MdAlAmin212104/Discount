(function() {
  document.addEventListener("DOMContentLoaded", function() {
    const container = document.querySelector(".discount-showcase-container");
    if (!container) return;

    const shop = container.getAttribute("data-shop");
    const showCountdown = container.getAttribute("data-show-countdown") === "true";
    const showStageLabel = container.getAttribute("data-show-stage-label") === "true";
    const itemsPerRow = container.getAttribute("data-items-per-row") || "3";

    // CSS styling parameters
    container.style.setProperty("--items-row", itemsPerRow);

    let activeSettings = null;

    // 1. Fetch active campaign products via App Proxy
    fetch(`/apps/discount-showcase/products?shop=${shop}`)
      .then(res => res.json())
      .then(data => {
        if (data.error || !data.products || data.products.length === 0) {
          container.innerHTML = '<div class="discount-showcase-loading">No active promotional campaigns at this time.</div>';
          return;
        }

        activeSettings = data.settings || {};
        applyThemeSettings(activeSettings);

        renderShowcase(data, showCountdown, showStageLabel);
      })
      .catch(err => {
        console.error("Error loading discount showcase:", err);
        container.innerHTML = '<div class="discount-showcase-loading">Unable to load promotions. Please try again later.</div>';
      });

    // Apply custom settings dynamically
    function applyThemeSettings(settings) {
      const root = document.documentElement;
      if (settings.badgeBg) root.style.setProperty('--ds-badge-bg', settings.badgeBg);
      if (settings.badgeTextColor) root.style.setProperty('--ds-badge-text-color', settings.badgeTextColor);
      if (settings.salePriceColor) root.style.setProperty('--ds-sale-price-color', settings.salePriceColor);
      if (settings.originalPriceColor) root.style.setProperty('--ds-original-price-color', settings.originalPriceColor);
      if (settings.fontSize) root.style.setProperty('--ds-font-size', `${settings.fontSize}px`);
      if (settings.fontWeight) root.style.setProperty('--ds-font-weight', settings.fontWeight);
      if (settings.padding) root.style.setProperty('--ds-padding', `${settings.padding}px`);
      if (settings.borderRadius) root.style.setProperty('--ds-border-radius', `${settings.borderRadius}px`);
      if (settings.alignment) {
        root.style.setProperty('--ds-alignment', settings.alignment);
        const priceAlign = settings.alignment === "center" ? "center" : settings.alignment === "right" ? "flex-end" : "flex-start";
        root.style.setProperty('--price-alignment', priceAlign);
      }
    }

    // Render slider items
    function renderShowcase(data, showTimer, showStage) {
      const { campaignName, stageLabel, products, settings } = data;
      const badgeText = settings?.badgeText || "Sale";

      let sliderHtml = `
        <div class="discount-slider-wrapper">
          <div class="discount-slider-prev">&#10094;</div>
          <div class="discount-slider-track">
      `;

      products.forEach(prod => {
        sliderHtml += `
          <div class="discount-product-card" data-handle="${prod.handle}" data-variant-id="${prod.variantId}">
            <div class="discount-card-badge">${badgeText}</div>
            <div class="discount-image-wrapper">
              <img src="${prod.image || 'https://cdn.shopify.com/s/images/admin/no-image-large.gif'}" alt="${prod.title}" loading="lazy">
            </div>
            <h3 class="discount-product-title">${prod.title}</h3>
            <div class="discount-prices">
              <span class="sale-price">$${parseFloat(prod.discountedPrice).toFixed(2)}</span>
              <span class="original-price">$${parseFloat(prod.originalPrice).toFixed(2)}</span>
            </div>
            <button class="discount-view-btn" data-handle="${prod.handle}" data-variant-id="${prod.variantId}" data-original-price="${prod.originalPrice}" data-discounted-price="${prod.discountedPrice}" data-stage="${stageLabel}">View Details</button>
          </div>
        `;
      });

      sliderHtml += `
          </div>
          <div class="discount-slider-next">&#10095;</div>
        </div>
      `;

      container.innerHTML = sliderHtml;

      // Add slider scrolling events
      const track = container.querySelector(".discount-slider-track");
      const prevBtn = container.querySelector(".discount-slider-prev");
      const nextBtn = container.querySelector(".discount-slider-next");

      prevBtn.addEventListener("click", () => {
        track.scrollBy({ left: -track.clientWidth / 2, behavior: "smooth" });
      });

      nextBtn.addEventListener("click", () => {
        track.scrollBy({ left: track.clientWidth / 2, behavior: "smooth" });
      });

      // Bind Details click
      container.querySelectorAll(".discount-view-btn").forEach(btn => {
        btn.addEventListener("click", function() {
          const handle = this.getAttribute("data-handle");
          const variantId = this.getAttribute("data-variant-id");
          const originalPrice = this.getAttribute("data-original-price");
          const discountedPrice = this.getAttribute("data-discounted-price");
          const stage = this.getAttribute("data-stage");

          openProductModal(handle, variantId, originalPrice, discountedPrice, stage);
        });
      });
    }

    // Modal elements
    const modal = document.getElementById("discount-product-modal");
    const closeBtn = document.querySelector(".discount-modal-close");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }

    window.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });

    function openProductModal(handle, variantId, originalPrice, discountedPrice, stage) {
      modal.style.display = "flex";

      // Reset values
      document.getElementById("modal-product-title").innerText = "Loading Title...";
      document.getElementById("modal-product-image").src = "https://cdn.shopify.com/s/images/admin/no-image-large.gif";
      document.getElementById("modal-product-description").innerText = "Loading details...";
      document.getElementById("modal-variant-id").value = variantId;
      document.getElementById("modal-original-price").innerText = `$${parseFloat(originalPrice).toFixed(2)}`;
      document.getElementById("modal-discounted-price").innerText = `$${parseFloat(discountedPrice).toFixed(2)}`;

      const stageBadge = document.getElementById("modal-stage-badge");
      if (showStageLabel && stage) {
        stageBadge.style.display = "inline-block";
        const labelText = activeSettings?.stageLabelText || "Stage";
        stageBadge.innerText = `${labelText}: ${stage}`;
      } else {
        stageBadge.style.display = "none";
      }

      // Hide countdown by default, updated when campaign is loaded
      const countdownEl = document.getElementById("modal-countdown");
      countdownEl.style.display = "none";

      // Fetch storefront product details using Shopify product json endpoint
      fetch(`/products/${handle}.js`)
        .then(res => res.json())
        .then(product => {
          document.getElementById("modal-product-title").innerText = product.title;
          if (product.featured_image) {
            document.getElementById("modal-product-image").src = product.featured_image;
          }
          
          // Set description (strip HTML tags)
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = product.description;
          document.getElementById("modal-product-description").innerText = tempDiv.textContent || tempDiv.innerText || "No description available.";
        })
        .catch(err => {
          console.error("Error loading storefront product details:", err);
          document.getElementById("modal-product-description").innerText = "Failed to load product description.";
        });
    }

    // Handle Add to Cart submission
    const cartForm = document.getElementById("modal-add-to-cart-form");
    if (cartForm) {
      cartForm.addEventListener("submit", function(e) {
        e.preventDefault();

        const variantId = document.getElementById("modal-variant-id").value;
        const quantity = parseInt(document.getElementById("modal-quantity").value) || 1;

        if (activeSettings && activeSettings.customJs && activeSettings.customJs.trim().length > 0) {
          try {
            // Execute Custom JS Override
            const customFn = new Function('context', activeSettings.customJs);
            customFn({ variantId, quantity, form: cartForm });
          } catch (jsErr) {
            console.error("Error in Custom Add to Cart JS Override:", jsErr);
            runDefaultAddToCart(variantId, quantity);
          }
        } else {
          runDefaultAddToCart(variantId, quantity);
        }
      });
    }

    function runDefaultAddToCart(variantId, quantity) {
      const submitBtn = document.getElementById("modal-submit-btn");
      submitBtn.innerText = "Adding...";
      submitBtn.disabled = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [{
            id: variantId,
            quantity: quantity
          }]
        })
      })
      .then(res => res.json())
      .then(cartData => {
        window.location.href = '/cart';
      })
      .catch(err => {
        console.error("Add to cart error:", err);
        alert("Failed to add product to cart. Please try again.");
      })
      .finally(() => {
        submitBtn.innerText = "Add to Cart";
        submitBtn.disabled = false;
      });
    }
  });
})();
