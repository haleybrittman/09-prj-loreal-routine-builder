/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

const workerURL = "https://gca-worker.hbrittman.workers.dev/"; 

const systemMessage = "You are an expert on L'Oréal products. Provide concise, helpful recommendations about products, routines, and usage tips. Ask clarifying questions when needed, and politely refuse requests that are unrelated to L'Oréal products or beauty routines.";

/* Conversation messages start with a system message and then grow with user/assistant turns */
const messages = [
  { role: "system", content: systemMessage }
];

/* Helper: fetch with timeout using AbortController */
async function fetchWithTimeout(resource, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return resp;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function showApiError(err, userMessage) {
  console.error("API error:", err);
  const message = userMessage || "Sorry — something went wrong while contacting the service. Please try again later.";
  messages.push({ role: "assistant", content: message });
  renderConversation();
}

/* Render the conversation (skip the system message for display) */
function renderConversation() {
  // show newest messages last
  const visible = messages.filter((m) => m.role !== "system");
  chatWindow.innerHTML = visible
    .map((m) => {
      const who = m.role === "user" ? "You" : "Assistant";
      // basic escaping
      // escape ampersand, less-than and greater-than to prevent HTML injection
      const content = String(m.content)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      // put message text in an element that preserves whitespace and line breaks via CSS
      return `<div class="chat-line chat-${m.role}"><strong>${who}:</strong> <span class="chat-text">${content}</span></div>`;
    })
    .join("");
  // scroll to bottom
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Set initial message
chatWindow.textContent = "👋 Hello! How can I help you today?";

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  // Simple in-memory cache to avoid refetching on every keystroke
  if (window.__productsCache && Array.isArray(window.__productsCache) && window.__productsCache.length) {
    return window.__productsCache;
  }
  const response = await fetch("products.json");
  const data = await response.json();
  window.__productsCache = data.products || [];
  return window.__productsCache;
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

/* Persist selected products to localStorage so selections survive reloads */
function saveSelectedProducts() {
  try {
    const arr = Array.from(selectedProducts.values());
    localStorage.setItem("selectedProducts", JSON.stringify(arr));
  } catch (e) {
    console.warn("Could not save selected products:", e);
  }
}

function loadSelectedProducts() {
  try {
    const raw = localStorage.getItem("selectedProducts");
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    arr.forEach((p) => {
      if (p && p.id != null) selectedProducts.set(Number(p.id), p);
    });
  } catch (e) {
    console.warn("Could not load selected products:", e);
  }
}

// Restore any saved selections at startup
loadSelectedProducts();
// Render any restored selections in the Selected Products list
updateSelectedProductsList();

/* Small debounce helper to reduce filtering frequency while typing */
function debounce(fn, wait = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* Matches a product against a search term across common fields */
function matchesSearch(product, term) {
  if (!term) return true;
  const t = term.toLowerCase();
  if ((product.name || "").toLowerCase().includes(t)) return true;
  if ((product.brand || "").toLowerCase().includes(t)) return true;
  if ((product.description || "").toLowerCase().includes(t)) return true;
  // support a 'keywords' field if the product provides it (string or array)
  if (product.keywords) {
    if (Array.isArray(product.keywords)) {
      if (product.keywords.join(" ").toLowerCase().includes(t)) return true;
    } else if (String(product.keywords).toLowerCase().includes(t)) return true;
  }
  return false;
}

/* Attach event listeners to the rendered product cards (selection + info toggle) */
function attachCardListeners(renderedProducts) {
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    const id = Number(card.dataset.id);
    const product = renderedProducts.find((p) => Number(p.id) === id);
    if (!product) return;

    // restore selected visual if already chosen earlier
    if (selectedProducts.has(id)) card.classList.add("selected");

    // clicking the card toggles selection
    // remove any existing listeners by cloning the node to prevent dupes
    const newCard = card.cloneNode(true);
    card.parentNode.replaceChild(newCard, card);
    newCard.addEventListener("click", () => toggleProductSelection(product, newCard));

    // info button toggles the description panel and should NOT toggle selection
    const infoBtn = newCard.querySelector(".info-btn");
    const desc = newCard.querySelector(`#desc-${id}`);
    if (infoBtn && desc) {
      infoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const expanded = infoBtn.getAttribute("aria-expanded") === "true";
        infoBtn.setAttribute("aria-expanded", String(!expanded));
        if (expanded) {
          desc.hidden = true;
          newCard.classList.remove("desc-open");
        } else {
          desc.hidden = false;
          newCard.classList.add("desc-open");
        }
      });
    }
  });
}

/* Filter products by category and search term and render the results */
async function filterAndDisplayProducts() {
  const selectedCategory = categoryFilter ? categoryFilter.value : "";
  const searchInput = document.getElementById("productSearch");
  const searchTerm = searchInput ? searchInput.value.trim() : "";

  const products = await loadProducts();

  // start with all products, then narrow
  let filtered = products.slice();

  if (selectedCategory) {
    filtered = filtered.filter((product) => String(product.category).toLowerCase() === String(selectedCategory).toLowerCase());
  }

  if (searchTerm) {
    filtered = filtered.filter((p) => matchesSearch(p, searchTerm));
  }

  // If there are no filters and nothing selected, show a friendly placeholder
  if (!selectedCategory && !searchTerm) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category or type to search products
      </div>
    `;
    return;
  }

  displayProducts(filtered);
  attachCardListeners(filtered);
}

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
  console.log(`toggleProductSelection: id=${id}, selectedCount=${selectedProducts.size}`);
  saveSelectedProducts();
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
      // persist removal
      saveSelectedProducts();
    });
  });
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", (e) => {
  // Delegate actual filtering to the shared function
  filterAndDisplayProducts();
});

// Wire up the new search input to filter as the user types (debounced)
const searchInput = document.getElementById("productSearch");
if (searchInput) {
  searchInput.addEventListener("input", debounce(() => {
    filterAndDisplayProducts();
  }, 180));
}

/* Chat form submission handler - sends a POST to the Cloudflare Worker and shows result */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const inputEl = document.getElementById("userInput");
  const userText = inputEl ? inputEl.value.trim() : "";
  if (!userText) return;

  // Immediately add the user message to conversation and clear the input
  messages.push({ role: "user", content: userText });
  renderConversation();
  if (inputEl) inputEl.value = "";

  // Show a working state
  chatWindow.insertAdjacentHTML("beforeend", `<div class=\"chat-line chat-system\"><em>Thinking...</em></div>`);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  // Build payload with full conversation history and current selected products
  const payload = {
    messages: messages,
    selectedProducts: Array.from(selectedProducts.values()).map((p) => ({ id: p.id, name: p.name, brand: p.brand }))
  };

  try {
    const res = await fetchWithTimeout(workerURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }, 15000);

    if (!res.ok) {
      let errText = `${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        errText = errJson.error || errJson.message || JSON.stringify(errJson);
      } catch (jsonErr) {
        const txt = await res.text();
        if (txt) errText = txt;
      }
      throw new Error(`Worker request failed: ${errText}`);
    }

    const data = await res.json();
    let reply = null;
    if (data.reply) reply = data.reply;
    else if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) reply = data.choices[0].message.content;
    else if (data.answer) reply = data.answer;
    else if (typeof data === "string") reply = data;
    else reply = JSON.stringify(data);

    // Remove the temporary 'Thinking...' line we added and append assistant reply
    // Simplest approach: re-render entire conversation including assistant reply
    messages.push({ role: "assistant", content: reply });
    renderConversation();
  } catch (err) {
    // Use centralized error handler to log and show a friendly assistant message
    showApiError(err, "Sorry — something went wrong while contacting the service. Please try again later.");
  }
});

/* Generate Routine button handler: send selected products to worker/OpenAI and display routine */
const generateBtn = document.getElementById("generateRoutine");
if (generateBtn) {
  generateBtn.addEventListener("click", async () => {
    if (selectedProducts.size === 0) {
      chatWindow.textContent = "Please select one or more products first.";
      return;
    }

    // Prepare selected products full data
    const productsForApi = Array.from(selectedProducts.values()).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description
    }));

    // Build the instruction and include a clear, machine-readable list of the selected products
    const userPrompt = `Generate a clear, step-by-step personalized routine using only the selected products. For each product, indicate when to use it (morning/evening/as needed), the order in the routine, and a short usage tip. If a product is not relevant to face skincare (e.g., haircare or fragrance), include a short note about its recommended use. Keep instructions concise and actionable.`;

    // Build a human-readable list of selected products to include in the message body so the worker/model definitely sees them
    const productsText = productsForApi
      .map((p, i) => `${i + 1}. ${p.name} — ${p.brand} (category: ${p.category})\n   ${p.description || ""}`)
      .join("\n\n");

    const combinedUserMessage = `${userPrompt}\n\nSelected products:\n${productsText}`;

    // push the combined message (prompt + explicit product list) into conversation so the worker receives it in messages
    messages.push({ role: "user", content: combinedUserMessage });
    renderConversation();

    // debug: log selected products and product payload
    console.log("Generate Routine clicked. selectedProducts size:", selectedProducts.size);
    console.log("selectedProducts map:", Array.from(selectedProducts.values()));

    chatWindow.insertAdjacentHTML("beforeend", `<div class=\"chat-line chat-system\"><em>Generating personalized routine... (${selectedProducts.size} products selected)</em></div>`);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    const payload = {
      messages: messages,
      selectedProducts: productsForApi
    };

    try {
      const res = await fetchWithTimeout(workerURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, 15000);

      if (!res.ok) {
        let errText = `${res.status} ${res.statusText}`;
        try {
          const errJson = await res.json();
          errText = errJson.error || errJson.message || JSON.stringify(errJson);
        } catch (jsonErr) {
          const txt = await res.text();
          if (txt) errText = txt;
        }
        throw new Error(`Worker request failed: ${errText}`);
      }

      const data = await res.json();
      let routine = null;
      if (data.reply) routine = data.reply;
      else if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) routine = data.choices[0].message.content;
      else if (data.answer) routine = data.answer;
      else if (typeof data === "string") routine = data;
      else routine = JSON.stringify(data);

      messages.push({ role: "assistant", content: routine });
      renderConversation();
    } catch (err) {
      // Centralized error handling so user sees a consistent assistant-style message
      showApiError(err, "Sorry — couldn't generate the routine right now. Please try again later.");
    }
  });
}

/* Clear all selections handler */
const clearBtn = document.getElementById("clearSelections");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    selectedProducts.clear();
    // remove selected visual state from any cards
    productsContainer.querySelectorAll('.product-card.selected').forEach((c) => c.classList.remove('selected'));
    updateSelectedProductsList();
    // persist cleared state
    try {
      localStorage.removeItem('selectedProducts');
    } catch (e) {
      // fallback to saving empty array
      saveSelectedProducts();
    }
  });
}
