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
    <div class="product-card" data-id="${product.id}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <div class="info-row">
          <div>
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
          </div>
          <button class="info-btn" aria-expanded="false" aria-controls="desc-${product.id}" title="Show description">ℹ️</button>
        </div>
        <div class="product-desc" id="desc-${product.id}" hidden>${product.description}</div>
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

  /* After products are rendered, add click handlers for selection and info toggle */
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    const id = Number(card.dataset.id);
    const product = filteredProducts.find((p) => Number(p.id) === id);
    if (!product) return;

    // restore selected visual if already chosen earlier
    if (selectedProducts.has(id)) card.classList.add("selected");

    // clicking the card toggles selection
    card.addEventListener("click", () => toggleProductSelection(product, card));

    // info button toggles the description panel and should NOT toggle selection
    const infoBtn = card.querySelector(".info-btn");
    const desc = card.querySelector(`#desc-${id}`);
    if (infoBtn && desc) {
      infoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const expanded = infoBtn.getAttribute("aria-expanded") === "true";
        infoBtn.setAttribute("aria-expanded", String(!expanded));
        if (expanded) {
          desc.hidden = true;
          card.classList.remove("desc-open");
        } else {
          desc.hidden = false;
          card.classList.add("desc-open");
        }
      });
    }
  });
});

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  chatWindow.innerHTML = "Connect to the OpenAI API for a response!";
});
