const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  products: [],
  gender: "all",
  cart: {}, // { productId: qty }
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

function cartQty(id) {
  return state.cart[id] || 0;
}

function cartEntries() {
  return Object.entries(state.cart).filter(([, qty]) => qty > 0);
}

function cartTotal() {
  return cartEntries().reduce((sum, [id, qty]) => sum + getProduct(id).price * qty, 0);
}

function cartItemsCount() {
  return cartEntries().reduce((sum, [, qty]) => sum + qty, 0);
}

function setQty(id, qty) {
  state.cart[id] = Math.max(0, qty);
  renderCartBadge();
  renderProductCard(id);
  renderCart();
}

function renderCartBadge() {
  cartCount.textContent = cartItemsCount();
}

function renderFilters() {
  filtersEl.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.gender === state.gender);
  });
}

function visibleProducts() {
  if (state.gender === "all") return state.products;
  return state.products.filter((p) => p.gender === state.gender);
}

function productCardHtml(product) {
  const qty = cartQty(product.id);
  const controlsHtml = !product.in_stock
    ? `<button class="add-btn" disabled>Нет в наличии</button>`
    : qty > 0
    ? `<div class="qty-control" data-id="${product.id}">
         <button class="qty-minus" type="button">−</button>
         <span>${qty}</span>
         <button class="qty-plus" type="button">+</button>
       </div>`
    : `<button class="add-btn" data-id="${product.id}" type="button">Добавить</button>`;

  return `
    <div class="product-card" data-card-id="${product.id}">
      ${!product.in_stock ? '<span class="out-of-stock-badge">Нет в наличии</span>' : ""}
      <img src="${product.image}" alt="${product.name}" loading="lazy" />
      <div class="product-info">
        <span class="product-brand">${product.brand}</span>
        <span class="product-name">${product.name}</span>
        <span class="product-volume">${product.volume_ml} мл</span>
        <div class="product-price-row">
          <span class="product-price">${formatPrice(product.price)}</span>
          ${product.old_price ? `<span class="product-old-price">${formatPrice(product.old_price)}</span>` : ""}
        </div>
        ${controlsHtml}
      </div>
    </div>
  `;
}

function renderGrid() {
  grid.innerHTML = visibleProducts().map(productCardHtml).join("");
}

function renderProductCard(id) {
  const card = grid.querySelector(`[data-card-id="${id}"]`);
  const product = getProduct(id);
  if (card && product) {
    card.outerHTML = productCardHtml(product);
  }
}

function cartItemHtml(id, qty) {
  const product = getProduct(id);
  return `
    <div class="cart-item" data-id="${id}">
      <img src="${product.image}" alt="${product.name}" />
      <div class="cart-item-info">
        <div class="cart-item-name">${product.name}</div>
        <div class="cart-item-price">${formatPrice(product.price)} × ${qty}</div>
      </div>
      <div class="qty-control" data-id="${id}">
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
    ? entries.map(([id, qty]) => cartItemHtml(id, qty)).join("")
    : '<div class="cart-empty">Корзина пуста</div>';
  cartTotalEl.textContent = formatPrice(cartTotal());
  checkoutBtn.disabled = entries.length === 0;
}

grid.addEventListener("click", (event) => {
  const addBtn = event.target.closest(".add-btn[data-id]");
  if (addBtn) {
    setQty(addBtn.dataset.id, cartQty(addBtn.dataset.id) + 1);
    return;
  }
  const qtyControl = event.target.closest(".qty-control");
  if (qtyControl) {
    const id = qtyControl.dataset.id;
    if (event.target.closest(".qty-plus")) setQty(id, cartQty(id) + 1);
    if (event.target.closest(".qty-minus")) setQty(id, cartQty(id) - 1);
  }
});

cartItemsEl.addEventListener("click", (event) => {
  const qtyControl = event.target.closest(".qty-control");
  if (!qtyControl) return;
  const id = qtyControl.dataset.id;
  if (event.target.closest(".qty-plus")) setQty(id, cartQty(id) + 1);
  if (event.target.closest(".qty-minus")) setQty(id, cartQty(id) - 1);
});

filtersEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".filter-chip");
  if (!chip) return;
  state.gender = chip.dataset.gender;
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
  const items = cartEntries().map(([id, qty]) => ({ id, qty }));
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
