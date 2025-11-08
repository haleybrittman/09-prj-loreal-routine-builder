/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
    </div>
  `
    )
    .join("");
}

/* Keep track of selected products in a Map keyed by product id */
const selectedProducts = new Map();

/* Toggle selection for a product and update UI */
function toggleProductSelection(product, cardEl) {
  const id = Number(product.id);

  if (selectedProducts.has(id)) {
    selectedProducts.delete(id);
    cardEl.classList.remove("selected");
  } else {
    selectedProducts.set(id, product);
    cardEl.classList.add("selected");
  }

  updateSelectedProductsList();
}

/* Render the selected products list with remove buttons */
function updateSelectedProductsList() {
  const list = document.getElementById("selectedProductsList");

  if (selectedProducts.size === 0) {
    list.innerHTML = `<div class="placeholder-message">No products selected</div>`;
    return;
  }

  list.innerHTML = Array.from(selectedProducts.values())
    .map(
      (p) => `
      <div class="selected-chip" data-id="${p.id}">
        <div class="chip-info">
          <strong>${p.name}</strong>
          <div class="chip-brand">${p.brand}</div>
        </div>
        <button class="remove-btn" aria-label="Remove ${p.name}" data-id="${p.id}">×</button>
      </div>
    `
    )
    .join("");

  // attach listeners to remove buttons
  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      selectedProducts.delete(id);

      // If a product card for this id exists in the grid, remove its selected class
      const card = productsContainer.querySelector(`.product-card[data-id='${id}']`);
      if (card) card.classList.remove("selected");

      updateSelectedProductsList();
    });
  });
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  /* Display the filtered products and attach click handlers that toggle selection */
  displayProducts(filteredProducts);

  /* After products are rendered, add dataset ids and click handlers */
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    // find product by index/unique image alt/title matching
    // we rely on the ordered products passed to displayProducts; find by name
    const nameEl = card.querySelector("h3");
    const name = nameEl ? nameEl.textContent.trim() : null;
    const product = filteredProducts.find((p) => p.name === name);
    if (!product) return;

    // attach data-id attribute for easy lookup
    card.dataset.id = product.id;

    // restore selected visual if already chosen earlier
    if (selectedProducts.has(Number(product.id))) {
      card.classList.add("selected");
    }

    card.addEventListener("click", () => toggleProductSelection(product, card));
  });
});

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  chatWindow.innerHTML = "Connect to the OpenAI API for a response!";
});
