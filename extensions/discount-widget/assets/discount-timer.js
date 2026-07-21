"use strict";(function(){document.addEventListener("DOMContentLoaded",function(){const w=document.querySelectorAll(".discountflow-widget-container");if(w.length===0)return;w.forEach(e=>{const d=e.getAttribute("data-shop"),i=e.getAttribute("data-product-id"),l=e.getAttribute("data-money-format")||"${{amount}}";if(!d||!i)return;let s=e.getAttribute("data-variant-id")||"";b(e,d,i,s,l);function a(r){let t="";r.detail&&r.detail.variant&&r.detail.variant.id?t=String(r.detail.variant.id):r.target&&r.target.name==="id"&&(t=r.target.value),t&&t!==s&&(s=t,e.style.display="none",e.innerHTML="",b(e,d,i,s,l))}document.addEventListener("variant:changed",a),document.addEventListener("variantChange",a),document.querySelectorAll('select[name="id"], input[name="id"]').forEach(r=>{r.addEventListener("change",a)})});function b(e,d,i,l,s){const a=e.getAttribute("data-design-mode")==="true";let r=`/apps/discount-showcase/products?shop=${d}&productId=${i}`;l&&(r+=`&variantId=${l}`),fetch(r).then(t=>t.json()).then(t=>{if(t.error||!t.stages||t.stages.length===0){a?f(e):e.style.display="none";return}x(e,t,s)}).catch(t=>{console.error("Error loading discount timer:",t),a?f(e):e.style.display="none"})}function h(e,d){let i=parseFloat(e).toFixed(2);return d.replace("{{amount}}",i).replace("{{amount_no_decimals}}",Math.round(i)).replace("{{amount_with_comma_separator}}",i.replace(".",",")).replace("${amount}",i)}function C(e,d,i){let l=parseFloat(e);return i==="PERCENTAGE"?l*(1-parseFloat(d)/100):i==="FIX_AMOUNT"?parseFloat(d):l}function x(e,d,i){const l=d.stages||[],s=d.settings||{},a=d.discountType||"PERCENTAGE",r=d.products&&d.products[0],t=parseFloat(r?r.originalPrice:e.getAttribute("data-product-price")||"0");if(isNaN(t)||t<=0)return;const n={title:s.welcomeHeading||"Limited time offer",subtitle:s.countdownText||"Sale ends in:",bgColor:s.bgColor||"#8b5cf6",textColor:s.textColor||"#ffffff",cardBgColor:s.cardColor||"#faf9f7",accentColor:s.accentColor||"#7c3aed",mutedColor:s.mutedColor||"#6b7280",borderColor:s.borderColor||"#e2dfd9",salePriceColor:s.salePriceColor||"#E63946",originalPriceColor:s.originalPriceColor||"#6B7280",borderRadius:s.borderRadius||16,maxWidth:s.maxWidth||580,paddingTop:s.paddingTop||40,paddingBottom:s.paddingBottom||40};if(e.style.setProperty("--sds-bg-color",n.bgColor),e.style.setProperty("--sds-bg-gradient",`linear-gradient(135deg, ${n.bgColor}, ${n.accentColor})`),e.style.setProperty("--sds-text-color",n.textColor),e.style.setProperty("--sds-card-color",n.cardBgColor),e.style.setProperty("--sds-accent-color",n.accentColor),e.style.setProperty("--sds-muted-color",n.mutedColor),e.style.setProperty("--sds-border-color",n.borderColor),e.style.setProperty("--sds-sale-color",n.salePriceColor),e.style.setProperty("--sds-original-color",n.originalPriceColor),e.style.setProperty("--sds-border-radius",n.borderRadius+"px"),e.style.setProperty("--sds-max-width",n.maxWidth+"px"),e.style.setProperty("--sds-padding-top",n.paddingTop+"px"),e.style.setProperty("--sds-padding-bottom",n.paddingBottom+"px"),s.customCss){let o=document.getElementById("discountflow-custom-css");o||(o=document.createElement("style"),o.id="discountflow-custom-css",document.head.appendChild(o)),o.innerHTML=s.customCss}const c=new Date,u=l.find(o=>new Date(o.startDate)<=c&&new Date(o.endDate)>=c);if(!u){e.getAttribute("data-design-mode")==="true"?f(e):e.style.display="none";return}const v=u.stageNumber,y=`${n.subtitle}`;let p='<div class="discountflow-timeline-wrapper">';p+=`
        <div class="discountflow-active-timer-card">
          <div class="discountflow-active-timer-title">${n.title}</div>
          <div class="discountflow-active-timer-subtitle">${y}</div>
          
          <div class="sds-countdown" data-sds-countdown="${u.endDate}">
            <div class="sds-countdown-col">
              <span class="sds-countdown-num" data-days>00</span>
              <span class="sds-countdown-lbl">Days</span>
            </div>
            <span class="sds-countdown-sep">:</span>
            <div class="sds-countdown-col">
              <span class="sds-countdown-num" data-hours>00</span>
              <span class="sds-countdown-lbl">Hrs</span>
            </div>
            <span class="sds-countdown-sep">:</span>
            <div class="sds-countdown-col">
              <span class="sds-countdown-num" data-mins>00</span>
              <span class="sds-countdown-lbl">Mins</span>
            </div>
            <span class="sds-countdown-sep">:</span>
            <div class="sds-countdown-col">
              <span class="sds-countdown-num" data-secs>00</span>
              <span class="sds-countdown-lbl">Secs</span>
            </div>
          </div>
        </div>
      `;let g='<div class="discountflow-releases-list">';l.forEach(o=>{if(o.stageNumber>v){const D=C(t,o.discountValue,a),M=l.find(B=>B.stageNumber===o.stageNumber-1)?.label||`Drop ${o.stageNumber-1}`,N=o.shippingNoteLeft||`DROP ${o.stageNumber} - OPENS AFTER ${M.toUpperCase()}`,L=o.phaseTitle||o.label||`Drop ${o.stageNumber}`,A=h(D,i),R=o.shippingNoteRight||`Ships in ~${o.stageNumber*15} days`;g+=`
            <div class="discountflow-release-row">
              <div class="discountflow-release-left">
                <div class="discountflow-release-eyebrow">${N}</div>
                <div class="discountflow-release-title">${L}</div>
              </div>
              <div class="discountflow-release-right">
                <div class="sds-release-price">${A}</div>
                <div class="discountflow-release-shipping">${R}</div>
              </div>
            </div>
          `}});const T=`DROP ${l.length+1} - PUBLIC RELEASE`,E="Open To The Public",$=h(t,i),m=s.publicShipping!==void 0?s.publicShipping:"Ships in ~5-7 days";let P="";m&&m.trim()!==""&&(P=`<div class="discountflow-release-shipping">${m}</div>`),g+=`
        <div class="discountflow-release-row public-release">
          <div class="discountflow-release-left">
            <div class="discountflow-release-eyebrow">${T}</div>
            <div class="discountflow-release-title">${E}</div>
          </div>
          <div class="discountflow-release-right">
            <div class="sds-release-price regular-price">${$}</div>
            ${P}
          </div>
        </div>
      `,g+="</div>",p+=g,p+="</div>",e.innerHTML=p,e.style.display="block",S(e.querySelector("[data-sds-countdown]"),u.endDate)}function S(e,d){if(!e)return;const i=new Date(d).getTime(),l=e.querySelector("[data-days]"),s=e.querySelector("[data-hours]"),a=e.querySelector("[data-mins]"),r=e.querySelector("[data-secs]");function t(){const c=i-Date.now();if(c<=0){l&&(l.innerText="00"),s&&(s.innerText="00"),a&&(a.innerText="00"),r&&(r.innerText="00"),clearInterval(n);return}const u=Math.floor(c/(1e3*60*60*24)),v=Math.floor(c/(1e3*60*60)%24),y=Math.floor(c/(1e3*60)%60),p=Math.floor(c/1e3%60);l&&(l.innerText=String(u).padStart(2,"0")),s&&(s.innerText=String(v).padStart(2,"0")),a&&(a.innerText=String(y).padStart(2,"0")),r&&(r.innerText=String(p).padStart(2,"0"))}t();const n=setInterval(t,1e3)}function f(e){e.style.removeProperty("--sds-bg-color"),e.style.removeProperty("--sds-bg-gradient"),e.style.removeProperty("--sds-text-color"),e.style.removeProperty("--sds-card-color"),e.style.removeProperty("--sds-accent-color"),e.style.removeProperty("--sds-muted-color"),e.style.removeProperty("--sds-border-color"),e.style.removeProperty("--sds-sale-color"),e.style.removeProperty("--sds-original-color"),e.style.padding="0",e.style.background="transparent",e.style.border="none",e.style.boxShadow="none",e.style.display="block",e.innerHTML=`
        <div class="discountflow-warning-banner">
          <div class="discountflow-warning-icon-box">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div class="discountflow-warning-text">
            Discount timer widget will only show on products that have an active discount campaign.
          </div>
        </div>
      `}})})();
