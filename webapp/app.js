const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  products: [],
  tab: "all", // all | hit | new | female | male | unisex
  brand: "all", // "all" | точное название бренда
  cart: {}, // { "productId::variantId": qty }
  paymentsEnabled: false,
  promo: null, // { code, percent }
  search: "",
  mood: null,
};

const grid = document.getElementById("product-grid");
const searchInput = document.getElementById("search-input");
const brandRailEl = document.getElementById("brand-rail");
const cartBtn = document.getElementById("cart-btn");
const cartCount = document.getElementById("cart-count");
const cartOverlay = document.getElementById("cart-overlay");
const cartItemsEl = document.getElementById("cart-items");
const cartTotalEl = document.getElementById("cart-total");
const closeCartBtn = document.getElementById("close-cart");
const checkoutBtn = document.getElementById("checkout-btn");
const filtersEl = document.getElementById("filters");
const toastEl = document.getElementById("toast");
const contactOverlay = document.getElementById("contact-overlay");
const closeContactBtn = document.getElementById("close-contact");
const contactForm = document.getElementById("contact-form");
const promoInput = document.getElementById("promo-input");
const promoApplyBtn = document.getElementById("promo-apply-btn");
const promoStatusEl = document.getElementById("promo-status");
const cartDiscountRow = document.getElementById("cart-discount-row");
const cartDiscountEl = document.getElementById("cart-discount");
const productOverlay = document.getElementById("product-overlay");
const productDetailBody = document.getElementById("product-detail-body");
const closeProductBtn = document.getElementById("close-product");
const heroBottleImg = document.getElementById("hero-bottle-img");
const newRailEl = document.getElementById("new-rail");
const bestsellerRailEl = document.getElementById("bestseller-rail");
const moodOptionsEl = document.getElementById("mood-options");
const moodHintEl = document.getElementById("mood-hint");

function formatPrice(value) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 2500);
}

function getProduct(id) {
  return state.products.find((p) => p.id === id);
}

function getVariant(productId, variantId) {
  const product = getProduct(productId);
  if (!product) return null;
  return product.variants.find((v) => v.id === variantId) || null;
}

function cartKey(productId, variantId) {
  return `${productId}::${variantId}`;
}

function cartQty(productId, variantId) {
  return state.cart[cartKey(productId, variantId)] || 0;
}

function cartEntries() {
  return Object.entries(state.cart)
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => {
      const [productId, variantId] = key.split("::");
      return {
        productId,
        variantId,
        qty,
        product: getProduct(productId),
        variant: getVariant(productId, variantId),
      };
    })
    .filter((entry) => entry.product && entry.variant);
}

function cartTotal() {
  return cartEntries().reduce((sum, entry) => sum + entry.variant.price * entry.qty, 0);
}

function cartItemsCount() {
  return cartEntries().reduce((sum, entry) => sum + entry.qty, 0);
}

function setQty(productId, variantId, qty) {
  state.cart[cartKey(productId, variantId)] = Math.max(0, qty);
  renderCartBadge();
  renderCart();
  if (!productOverlay.classList.contains("hidden") && productOverlay.dataset.productId === productId) {
    renderProductDetail(productId);
  }
}

function renderCartBadge() {
  cartCount.textContent = cartItemsCount();
}

function renderFilters() {
  filtersEl.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.tab === state.tab);
  });
}

function matchesSearch(product) {
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  return product.name.toLowerCase().includes(q) || product.brand.toLowerCase().includes(q);
}

function matchesBrand(product) {
  return state.brand === "all" || product.brand === state.brand;
}

function visibleProducts() {
  let list = state.products;
  if (state.tab === "hit") list = list.filter((p) => p.is_hit);
  else if (state.tab === "new") list = list.filter((p) => p.is_new);
  else if (state.tab !== "all") list = list.filter((p) => p.gender === state.tab);
  if (state.mood) list = list.filter((p) => moodTagsFor(p).has(state.mood));
  return list.filter(matchesBrand).filter(matchesSearch);
}

function brandCounts() {
  const counts = new Map();
  state.products.forEach((p) => counts.set(p.brand, (counts.get(p.brand) || 0) + 1));
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderBrandRail() {
  const brands = brandCounts();
  const allChip = `<button class="brand-chip${state.brand === "all" ? " active" : ""}" data-brand="all">
      <span>Все ароматы</span><span class="brand-chip-count">${state.products.length}</span>
    </button>`;
  const brandChips = brands
    .map(
      ([brand, count]) => `
    <button class="brand-chip${state.brand === brand ? " active" : ""}" data-brand="${brand}">
      <span>${brand}</span><span class="brand-chip-count">${count}</span>
    </button>`
    )
    .join("");
  brandRailEl.innerHTML = allChip + brandChips;
}

function variantControlHtml(product, variant) {
  const qty = cartQty(product.id, variant.id);

  if (!variant.in_stock) {
    return `<button class="add-btn" disabled>Нет в наличии</button>`;
  }
  if (qty > 0) {
    return `<div class="qty-control" data-product="${product.id}" data-variant="${variant.id}">
         <button class="qty-minus" type="button">−</button>
         <span>${qty}</span>
         <button class="qty-plus" type="button">+</button>
       </div>`;
  }
  return `<button class="add-btn" data-product="${product.id}" data-variant="${variant.id}" type="button">Добавить</button>`;
}

function cheapestVariant(product) {
  return product.variants.slice().sort((a, b) => a.price - b.price)[0];
}

/* ---------- ноты аромата (эвристика на основе описания) ---------- */

function notesFromDescription(product) {
  if (!product.description) return [];
  return product.description
    .split(/[,;.]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 40)
    .slice(0, 6);
}

const MOOD_KEYWORDS = {
  work: ["чист", "свеж", "цитрус", "минимал", "офис", "делов", "прозрачн", "легк", "зелен"],
  date: ["чувствен", "сладк", "ваниль", "мускус", "страст", "романт", "вечер", "соблазн", "цветоч", "тепл"],
  everyday: ["универс", "повседневн", "древесн", "нейтральн"],
};

function moodTagsFor(product) {
  const text = `${product.description || ""} ${product.name}`.toLowerCase();
  const tags = new Set();
  Object.entries(MOOD_KEYWORDS).forEach(([mood, keywords]) => {
    if (keywords.some((kw) => text.includes(kw))) tags.add(mood);
  });
  if (tags.size === 0) tags.add("everyday");
  return tags;
}

/* ---------- hero: флакон дня ---------- */

function cutoutWhiteBackground(source, maxSize = 700) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        const softStart = 16;
        const hardEnd = 62;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], g = px[i + 1], b = px[i + 2];
          const dist = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
          if (dist <= softStart) {
            px[i + 3] = 0;
          } else if (dist < hardEnd) {
            px[i + 3] = Math.round(((dist - softStart) / (hardEnd - softStart)) * 255);
          }
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        resolve(source);
      }
    };
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = source;
  });
}

function renderHeroBottle() {
  if (!heroBottleImg || !state.products.length) return;
  const featured =
    state.products.find((p) => p.is_hit) || state.products[Math.floor(Math.random() * state.products.length)];
  if (!featured) return;
  heroBottleImg.alt = featured.name;
  cutoutWhiteBackground(featured.image)
    .then((dataUrl) => {
      heroBottleImg.addEventListener("load", () => heroBottleImg.classList.add("loaded"), { once: true });
      heroBottleImg.src = dataUrl;
    })
    .catch(() => {
      heroBottleImg.addEventListener("load", () => heroBottleImg.classList.add("loaded"), { once: true });
      heroBottleImg.src = featured.image;
    });
}

/* ---------- подборки: Новинки / Бестселлеры ---------- */

function railCardHtml(product) {
  const cheapest = cheapestVariant(product);
  if (!cheapest) return "";
  return `
    <div class="rail-card" data-product-id="${product.id}">
      <img src="${product.image}" alt="${product.name}" loading="lazy" />
      <div class="rail-card-info">
        <span class="rail-card-brand">${product.brand}</span>
        <div class="rail-card-name">${product.name}</div>
      </div>
    </div>
  `;
}

function renderRails() {
  const newest = state.products.filter((p) => p.is_new).slice(0, 10);
  const bestsellers = state.products.filter((p) => p.is_hit).slice(0, 10);

  newRailEl.innerHTML = newest.length
    ? newest.map(railCardHtml).join("")
    : '<p class="rail-empty">Скоро появятся новые ароматы</p>';

  bestsellerRailEl.innerHTML = bestsellers.length
    ? bestsellers.map(railCardHtml).join("")
    : '<p class="rail-empty">Собираем подборку хитов</p>';

  [newRailEl, bestsellerRailEl].forEach((rail) => {
    rail.querySelectorAll(".rail-card").forEach((card) => {
      card.addEventListener("click", () => openProductDetail(card.dataset.productId));
    });
  });
}

/* ---------- подбор аромата по настроению ---------- */

const MOOD_LABELS = {
  work: "Для работы подойдут чистые, прозрачные и минималистичные ароматы.",
  date: "Для свидания — чувственные, тёплые и обволакивающие композиции.",
  everyday: "На каждый день — универсальные ароматы, которые уместны везде.",
};

moodOptionsEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".mood-chip");
  if (!chip) return;
  const mood = chip.dataset.mood;
  state.mood = state.mood === mood ? null : mood;
  moodOptionsEl.querySelectorAll(".mood-chip").forEach((c) => c.classList.toggle("active", c.dataset.mood === state.mood));

  if (state.mood) {
    moodHintEl.textContent = MOOD_LABELS[state.mood];
    state.tab = "all";
    renderFilters();
    renderGridAnimated();
    document.getElementById("product-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    moodHintEl.textContent = "";
    renderGridAnimated();
  }
});

function productCardHtml(product, index) {
  const cheapest = cheapestVariant(product);
  if (!cheapest) return "";

  const badge = product.is_hit ? "🏆 Хит" : product.is_new ? "🆕 Новинка" : "";

  return `
    <div class="product-card" data-product-id="${product.id}" style="--card-index:${index % 12}">
      ${badge ? `<span class="product-badge">${badge}</span>` : ""}
      <img src="${product.image}" alt="${product.name}" loading="lazy" />
      <div class="product-info">
        <span class="product-brand">${product.brand}</span>
        <span class="product-name">${product.name}</span>
        <span class="product-volume">от ${cheapest.volume_ml} мл</span>
        ${product.description ? `<p class="product-description">${product.description}</p>` : ""}
        <div class="product-price-row">
          <span class="product-price">от ${formatPrice(cheapest.price)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderGrid() {
  const products = visibleProducts();
  grid.innerHTML = products.length
    ? products.map((p, i) => productCardHtml(p, i)).join("")
    : '<p class="cart-empty">Ничего не найдено</p>';
}

function variantRowHtml(product, variant) {
  return `
    <div class="detail-variant-row">
      <div class="detail-variant-label">${variant.label}</div>
      <div class="detail-variant-price">${formatPrice(variant.price)}</div>
      ${variantControlHtml(product, variant)}
    </div>
  `;
}

function renderProductDetail(productId) {
  const product = getProduct(productId);
  if (!product) return;

  const rows = product.variants.map((v) => variantRowHtml(product, v)).join("");
  const notes = notesFromDescription(product);
  const notesHtml = notes.length
    ? `<ul class="detail-notes">${notes
        .map((note, i) => `<li style="--note-index:${i}">${note}</li>`)
        .join("")}</ul>`
    : "";

  productDetailBody.innerHTML = `
    <img src="${product.image}" alt="${product.name}" class="product-detail-image" />
    <span class="product-brand">${product.brand}</span>
    <h3 class="product-detail-name">${product.name}</h3>
    ${notesHtml}
    <div class="detail-variants">${rows}</div>
  `;
}

function openProductDetail(productId) {
  renderProductDetail(productId);
  productOverlay.dataset.productId = productId;
  productOverlay.classList.remove("hidden");
}

function cartItemHtml(entry) {
  const { product, variant, qty } = entry;
  return `
    <div class="cart-item">
      <img src="${product.image}" alt="${product.name}" />
      <div class="cart-item-info">
        <div class="cart-item-name">${product.brand} ${product.name}</div>
        <div class="cart-item-variant">${variant.label}</div>
        <div class="cart-item-price">${formatPrice(variant.price)} × ${qty}</div>
      </div>
      <div class="qty-control" data-product="${product.id}" data-variant="${variant.id}">
        <button class="qty-minus" type="button">−</button>
        <span>${qty}</span>
        <button class="qty-plus" type="button">+</button>
      </div>
    </div>
  `;
}

function discountAmount() {
  if (!state.promo) return 0;
  return Math.floor((cartTotal() * state.promo.percent) / 100);
}

function renderCart() {
  const entries = cartEntries();
  cartItemsEl.innerHTML = entries.length
    ? entries.map(cartItemHtml).join("")
    : '<div class="cart-empty">Корзина пуста</div>';

  const discount = discountAmount();
  if (discount > 0) {
    cartDiscountRow.classList.remove("hidden");
    cartDiscountEl.textContent = `−${formatPrice(discount)}`;
  } else {
    cartDiscountRow.classList.add("hidden");
  }

  cartTotalEl.textContent = formatPrice(cartTotal() - discount);
  checkoutBtn.disabled = entries.length === 0;
}

promoApplyBtn.addEventListener("click", async () => {
  const code = promoInput.value.trim();
  if (!code) return;

  promoApplyBtn.disabled = true;
  try {
    const response = await fetch("/api/promo/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    if (data.valid) {
      state.promo = { code: data.code, percent: data.percent };
      promoStatusEl.textContent = `✓ Промокод применён: −${data.percent}%`;
      promoStatusEl.className = "promo-status ok";
    } else {
      state.promo = null;
      promoStatusEl.textContent = "Промокод не найден";
      promoStatusEl.className = "promo-status error";
    }
  } catch (err) {
    promoStatusEl.textContent = "Не удалось проверить промокод";
    promoStatusEl.className = "promo-status error";
  } finally {
    promoApplyBtn.disabled = false;
    renderCart();
  }
});

grid.addEventListener("click", (event) => {
  const card = event.target.closest(".product-card[data-product-id]");
  if (!card) return;
  openProductDetail(card.dataset.productId);
});

productDetailBody.addEventListener("click", (event) => {
  const addBtn = event.target.closest(".add-btn[data-product]");
  if (addBtn) {
    setQty(addBtn.dataset.product, addBtn.dataset.variant, cartQty(addBtn.dataset.product, addBtn.dataset.variant) + 1);
    return;
  }
  const qtyControl = event.target.closest(".qty-control");
  if (qtyControl) {
    const { product, variant } = qtyControl.dataset;
    if (event.target.closest(".qty-plus")) setQty(product, variant, cartQty(product, variant) + 1);
    if (event.target.closest(".qty-minus")) setQty(product, variant, cartQty(product, variant) - 1);
  }
});

closeProductBtn.addEventListener("click", () => {
  productOverlay.classList.add("hidden");
});

cartItemsEl.addEventListener("click", (event) => {
  const qtyControl = event.target.closest(".qty-control");
  if (!qtyControl) return;
  const { product, variant } = qtyControl.dataset;
  if (event.target.closest(".qty-plus")) setQty(product, variant, cartQty(product, variant) + 1);
  if (event.target.closest(".qty-minus")) setQty(product, variant, cartQty(product, variant) - 1);
});

function renderGridAnimated() {
  grid.classList.add("grid-leaving");
  window.setTimeout(() => {
    renderGrid();
    grid.classList.remove("grid-leaving");
    grid.classList.add("grid-entering");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => grid.classList.remove("grid-entering"));
    });
  }, 200);
}

filtersEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".filter-chip");
  if (!chip) return;
  if (chip.dataset.tab === state.tab) return;
  state.tab = chip.dataset.tab;
  renderFilters();
  renderGridAnimated();
});

searchInput.addEventListener("input", () => {
  state.search = searchInput.value;
  renderGrid();
});

brandRailEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".brand-chip");
  if (!chip) return;
  if (chip.dataset.brand === state.brand) return;
  state.brand = chip.dataset.brand;
  renderBrandRail();
  renderGridAnimated();
});

cartBtn.addEventListener("click", () => {
  renderCart();
  cartOverlay.classList.remove("hidden");
});

closeCartBtn.addEventListener("click", () => {
  cartOverlay.classList.add("hidden");
});

function clearCartAndClose() {
  state.cart = {};
  state.promo = null;
  promoInput.value = "";
  promoStatusEl.textContent = "";
  renderCartBadge();
  renderGrid();
  renderCart();
  cartOverlay.classList.add("hidden");
  contactOverlay.classList.add("hidden");
}

async function submitOrder(extraPayload) {
  const items = cartEntries().map((entry) => ({ id: entry.productId, variant: entry.variantId, qty: entry.qty }));
  const response = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      initData: tg?.initData || "",
      items,
      promo_code: state.promo?.code || "",
      ...extraPayload,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "checkout_failed");
  }
  return data;
}

checkoutBtn.addEventListener("click", async () => {
  if (cartEntries().length === 0) return;

  if (!state.paymentsEnabled) {
    // Онлайн-оплата пока не подключена — просим контакты, оплата вне бота
    cartOverlay.classList.add("hidden");
    contactOverlay.classList.remove("hidden");
    return;
  }

  checkoutBtn.disabled = true;
  checkoutBtn.textContent = "Оформляем...";

  try {
    const data = await submitOrder({});

    if (tg?.openInvoice) {
      tg.openInvoice(data.invoice_link, (status) => {
        if (status === "paid") {
          clearCartAndClose();
          showToast("Оплата прошла успешно!");
        } else if (status === "failed") {
          showToast("Оплата не прошла.");
        }
      });
    } else {
      window.open(data.invoice_link, "_blank");
    }
  } catch (err) {
    showToast("Не удалось оформить заказ. Попробуйте ещё раз.");
  } finally {
    checkoutBtn.disabled = cartEntries().length === 0;
    checkoutBtn.textContent = "Оформить заказ";
  }
});

closeContactBtn.addEventListener("click", () => {
  contactOverlay.classList.add("hidden");
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (cartEntries().length === 0) return;

  const submitBtn = document.getElementById("submit-order-btn");
  const formData = new FormData(contactForm);
  const contact = {
    name: formData.get("name")?.toString().trim() || "",
    phone: formData.get("phone")?.toString().trim() || "",
    address: formData.get("address")?.toString().trim() || "",
    delivery_method: formData.get("delivery_method")?.toString() || "russian_post",
    payment_method: formData.get("payment_method")?.toString() || "transfer",
  };

  if (!contact.name || !contact.phone) {
    showToast("Заполните имя и телефон.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Отправляем...";

  try {
    const data = await submitOrder({ contact });
    clearCartAndClose();
    contactForm.reset();
    showToast(`Заказ №${data.order_id} отправлен! Мы свяжемся с вами в этом чате.`);
  } catch (err) {
    showToast("Не удалось отправить заказ. Попробуйте ещё раз.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Отправить заказ";
  }
});

async function loadConfig() {
  const response = await fetch("/api/config");
  const data = await response.json();
  state.paymentsEnabled = Boolean(data.payments_enabled);
}

async function loadProducts() {
  const response = await fetch("/api/products");
  state.products = await response.json();
  renderBrandRail();
  renderGrid();
  renderRails();
  renderHeroBottle();
}

function initScrollReveal() {
  const targets = document.querySelectorAll(".fade-in");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in-view"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  targets.forEach((el) => observer.observe(el));
}

function initParallax() {
  const layer = document.querySelector(".hero-parallax");
  if (!layer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const factor = Number(layer.dataset.parallax) || 0.12;
  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        layer.style.transform = `translateY(${window.scrollY * factor}px)`;
        ticking = false;
      });
    },
    { passive: true }
  );
}

Promise.all([loadConfig(), loadProducts()]).then(() => {
  initScrollReveal();
  initParallax();
});
