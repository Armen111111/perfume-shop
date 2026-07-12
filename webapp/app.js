const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  products: [],
  tab: "all", // all | female | male | unisex | decant
  cart: {}, // { "productId::variantId": qty }
  paymentsEnabled: false,
};

const grid = document.getElementById("product-grid");
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
  renderGrid();
  renderCart();
}

function renderCartBadge() {
  cartCount.textContent = cartItemsCount();
}

function renderFilters() {
  filtersEl.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.tab === state.tab);
  });
}

function visibleProducts() {
  if (state.tab === "all" || state.tab === "decant") return state.products;
  return state.products.filter((p) => p.gender === state.tab);
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

function productCardHtml(product) {
  const full = product.variants.find((v) => v.type === "full");
  const tester = product.variants.find((v) => v.type === "tester");
  if (!full) return "";

  return `
    <div class="product-card">
      <img src="${product.image}" alt="${product.name}" loading="lazy" />
      <div class="product-info">
        <span class="product-brand">${product.brand}</span>
        <span class="product-name">${product.name}</span>
        <span class="product-volume">${full.volume_ml} мл</span>
        <div class="product-price-row">
          <span class="product-price">${formatPrice(full.price)}</span>
        </div>
        ${variantControlHtml(product, full)}
        ${
          tester
            ? `<div class="variant-secondary">
                 <span class="variant-secondary-label">Тестер — ${formatPrice(tester.price)}</span>
                 ${variantControlHtml(product, tester)}
               </div>`
            : ""
        }
      </div>
    </div>
  `;
}

function decantCardHtml(product, variant) {
  return `
    <div class="product-card">
      <img src="${product.image}" alt="${product.name}" loading="lazy" />
      <div class="product-info">
        <span class="product-brand">${product.brand}</span>
        <span class="product-name">${product.name}</span>
        <span class="product-volume">${variant.label}</span>
        <div class="product-price-row">
          <span class="product-price">${formatPrice(variant.price)}</span>
        </div>
        ${variantControlHtml(product, variant)}
      </div>
    </div>
  `;
}

function renderGrid() {
  if (state.tab === "decant") {
    const cards = [];
    state.products.forEach((product) => {
      product.variants
        .filter((v) => v.type === "decant")
        .forEach((variant) => cards.push(decantCardHtml(product, variant)));
    });
    grid.innerHTML = cards.join("") || '<p class="cart-empty">Пока нет отливантов в наличии</p>';
    return;
  }
  grid.innerHTML = visibleProducts().map(productCardHtml).join("");
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

function renderCart() {
  const entries = cartEntries();
  cartItemsEl.innerHTML = entries.length
    ? entries.map(cartItemHtml).join("")
    : '<div class="cart-empty">Корзина пуста</div>';
  cartTotalEl.textContent = formatPrice(cartTotal());
  checkoutBtn.disabled = entries.length === 0;
}

grid.addEventListener("click", (event) => {
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

cartItemsEl.addEventListener("click", (event) => {
  const qtyControl = event.target.closest(".qty-control");
  if (!qtyControl) return;
  const { product, variant } = qtyControl.dataset;
  if (event.target.closest(".qty-plus")) setQty(product, variant, cartQty(product, variant) + 1);
  if (event.target.closest(".qty-minus")) setQty(product, variant, cartQty(product, variant) - 1);
});

filtersEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".filter-chip");
  if (!chip) return;
  state.tab = chip.dataset.tab;
  renderFilters();
  renderGrid();
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
    body: JSON.stringify({ initData: tg?.initData || "", items, ...extraPayload }),
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
  renderGrid();
}

Promise.all([loadConfig(), loadProducts()]);
