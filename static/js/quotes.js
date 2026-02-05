(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[Quotes]', ...args);
        }
    }

/**
 * Quotes Manager Module
 * Handles the retrieval, caching, and periodic rotation of motivational quotes.
 */
const QuotesManager = {
    /**
     * Internal state management
     */
    state: {
        quoteInterval: null,
        cycleInterval: null
    },
    
    /**
     * Initializes the quotes manager and starts background tasks.
     */
    init: function() {
        console.log("[Quotes] Initializing Quotes Manager...");
        this.initHeader();
        this.initBackgroundTasks();
        this.initHomeQuotes();
    },

    /**
     * Configures the header quote display and rotation.
     */
    initHeader: function() {
        this.fetchQuote();
        this.startQuoteCycle('quote-container');
    },

    /**
     * Sets up recurring background quote fetching.
     */
    initBackgroundTasks: function() {
        setInterval(() => {
            this.fetchQuote();
        }, 60000); // Every 60 seconds
    },

    /**
     * Initializes quote display specifically for the home page.
     */
    initHomeQuotes: function() {
        const quoteEl = document.getElementById("random-quote");
        if (!quoteEl) return;

        let quotes = [];
        const cached = localStorage.getItem("cache_quotes");
        if (cached) {
            try {
                quotes = JSON.parse(cached);
            } catch (e) {}
        }

        if (quotes && quotes.length > 0) {
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            quoteEl.innerHTML = `"${randomQuote.q || randomQuote.quote}" &mdash; ${randomQuote.a || randomQuote.author}`;
        } else {
            this.fetchQuote().then(() => {
                const freshCached = localStorage.getItem("cache_quotes");
                if (freshCached) {
                    const freshQuotes = JSON.parse(freshCached);
                    if (freshQuotes.length > 0) {
                        const randomQuote = freshQuotes[Math.floor(Math.random() * freshQuotes.length)];
                        quoteEl.innerHTML = `"${randomQuote.q}" &mdash; ${randomQuote.a}`;
                    }
                }
            });
        }

        this.startQuoteCycle('random-quote');
    },

    /**
     * Starts the automatic rotation of quotes in a specific container.
     * @param {string} targetId - The DOM element ID to update.
     */
    startQuoteCycle: function(targetId) {
        if (targetId === 'quote-container') {
            if (this.state.cycleInterval) clearInterval(this.state.cycleInterval);
            this.state.cycleInterval = setInterval(() => this.updateQuoteUI(targetId), 10000);
        } else if (targetId === 'random-quote') {
            if (this.state.quoteInterval) clearInterval(this.state.quoteInterval);
            this.state.quoteInterval = setInterval(() => this.updateQuoteUI(targetId), 10000);
        }
    },

    /**
     * Updates the UI with a random quote from the cache.
     * @param {string} containerId - The DOM element ID.
     */
    updateQuoteUI: function(containerId) {
        const cache = JSON.parse(localStorage.getItem("cache_quotes") || "[]");
        if (cache.length > 0) {
            const randomQuote = cache[Math.floor(Math.random() * cache.length)];
            const container = document.getElementById(containerId);
            if (container) {
                container.classList.add("fade-out");
                if (containerId === 'quote-container') container.classList.add("quote-transition");
                
                setTimeout(() => {
                    container.innerHTML = `"${randomQuote.q}" &mdash; ${randomQuote.a}`;
                    container.classList.remove("fade-out");
                }, 500);
            }
        }
    },

    /**
     * Fetches new quotes from the server and updates the local cache.
     */
    fetchQuote: async function() {
        const fallbackMsg = "UrNetwork: Say Goodbye to your traditional VPN!";
        const container = document.getElementById("quote-container");
        
        if (container) {
            const content = container.textContent.trim();
            const isPlaceholder = !content || content === fallbackMsg || container.innerHTML.includes("<!--");
            if (isPlaceholder) {
                const cache = JSON.parse(localStorage.getItem("cache_quotes") || "[]");
                if (cache.length > 0) {
                    const q = cache[Math.floor(Math.random() * cache.length)];
                    container.innerHTML = `"${q.q}" &mdash; ${q.a}`;
                } else {
                    container.textContent = fallbackMsg;
                }
            }
        }

        try {
            const response = await fetch("/api/quote");
            const data = await response.json();
            
            if (typeof ErrorManager !== "undefined") ErrorManager.handleApiResponse(data);

            if (data && Array.isArray(data) && data.length > 0) {
                let cache = JSON.parse(localStorage.getItem("cache_quotes") || "[]");
                const now = Date.now();
                
                data.forEach(q => {
                    if (!cache.some(c => c.q === q.q)) {
                        cache.push({ ...q, added_at: now });
                    }
                });
                
                cache.sort((a, b) => (b.added_at || 0) - (a.added_at || 0));
                if (cache.length > 100) cache = cache.slice(0, 100);
                
                localStorage.setItem("cache_quotes", JSON.stringify(cache));
                
                if (container && container.textContent === fallbackMsg) {
                    const q = data[Math.floor(Math.random() * data.length)];
                    container.innerHTML = `"${q.q}" &mdash; ${q.a}`;
                }
            }
        } catch (err) {
            console.warn("[Quotes] Background fetch failed:", err);
        }
    },

    /**
     * Displays the quotes modal populated with cached entries.
     */
    showQuotesModal: function() {
        const modalEl = document.getElementById("quotesModal");
        const quotesList = document.getElementById("quotes-list");
        const quotesEmpty = document.getElementById("quotes-empty");
        
        if (!modalEl || !quotesList || !quotesEmpty) return;
        
        const cached = localStorage.getItem("cache_quotes");
        let quotes = cached ? JSON.parse(cached) : [];
        
        quotesList.innerHTML = "";
        
        if (quotes.length === 0) {
            quotesList.style.display = "none";
            quotesEmpty.style.display = "block";
        } else {
            quotesList.style.display = "block";
            quotesEmpty.style.display = "none";
            
            quotes.forEach((quote, index) => {
                const item = document.createElement("div");
                item.className = "list-group-item";
                item.innerHTML = `
                    <div class="d-flex w-100 justify-content-between">
                        <p class="mb-1 fst-italic">"${quote.q || quote.quote || "Unknown quote"}"</p>
                        <button class="btn btn-outline-secondary" onclick="copyQuote(${index})" style="min-width: 40px; height: 38px; display: flex; align-items: center; justify-content: center;">
                            <i class="bi bi-copy"></i>
                        </button>
                    </div>
                    <small class="text-muted">— ${quote.a || quote.author || "Unknown author"}</small>
                `;
                quotesList.appendChild(item);
            });
        }
        
        // Ensure accessibility attributes are compliant before showing
        // This fixes "Blocked aria-hidden" errors if the modal takes focus while still marked hidden
        modalEl.removeAttribute('aria-hidden');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.setAttribute('role', 'dialog');
        
        if (window.bootstrap) {
            const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            if (!modalEl.classList.contains('show')) modal.show();
        } else {
            // Fallback for when Bootstrap is not loaded
            modalEl.classList.add("show");
            modalEl.style.display = "block";
            
            // Wire up close buttons for the fallback state
            const closeBtns = modalEl.querySelectorAll('[data-bs-dismiss="modal"]');
            closeBtns.forEach(btn => {
                btn.onclick = () => {
                    modalEl.classList.remove("show");
                    modalEl.style.display = "none";
                    modalEl.setAttribute('aria-hidden', 'true');
                    modalEl.removeAttribute('aria-modal');
                };
            });
        }
    },

    /**
     * Copies a specific quote to the system clipboard.
     * @param {number} index - Index of the quote in the cache.
     */
    copyQuote: function(index) {
        const cached = localStorage.getItem("cache_quotes");
        if (!cached) return;
        
        let quotes = [];
        try {
            quotes = JSON.parse(cached);
        } catch (e) { return; }

        if (index < 0 || index >= quotes.length) return;
        
        const q = quotes[index];
        const textToCopy = `"${q.q || q.quote || "Unknown quote"}" — ${q.a || q.author || "Unknown author"}`;
        
        const performFallbackCopy = (text) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            
            // Standard off-screen positioning
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            textArea.setAttribute('readonly', '');
            
            // CRITICAL FIX: Append to the modal body to avoid focus trap issues with Bootstrap modals
            const modalBody = document.querySelector('#quotesModal .modal-body') || document.body;
            modalBody.appendChild(textArea);
            
            textArea.focus();
            textArea.select();
            textArea.setSelectionRange(0, 99999); // For mobile

            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    if (typeof ErrorManager !== "undefined") ErrorManager.showToast("Quote copied!", "success");
                } else {
                    throw new Error("execCommand returned false");
                }
            } catch (err) {
                console.error("[Quotes] Fallback copy failed:", err);
                if (typeof ErrorManager !== "undefined") ErrorManager.showToast("Failed to copy quote", "error");
                // Final prompt fallback if execCommand fails
                window.prompt("Copying failed. Use Ctrl+C to copy:", text);
            }
            
            if (textArea.parentNode) {
                textArea.parentNode.removeChild(textArea);
            }
        };

        // Try Async Clipboard API if available and secure
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    if (typeof ErrorManager !== "undefined") ErrorManager.showToast("Quote copied!", "success");
                })
                .catch((err) => {
                    console.warn("[Quotes] Clipboard API failed, attempting fallback...", err);
                    performFallbackCopy(textToCopy);
                });
        } else {
            // Immediate fallback for insecure contexts (HTTP/IPv6)
            performFallbackCopy(textToCopy);
        }
    },

    /**
     * Internal helper to show success feedback.
     */
    handleCopySuccess: function() {
        console.log("[Quotes] Copy operation confirmed success.");
        if (typeof ErrorManager !== "undefined") {
            ErrorManager.showToast("Quote copied to clipboard!", "success");
        }
    },

    /**
     * Forces a fresh fetch of quotes and refreshes the modal if open.
     */
    refreshQuotes: function() {
        fetch("/api/quote").then(r => r.json()).then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
                let cache = JSON.parse(localStorage.getItem("cache_quotes") || "[]");
                const now = Date.now();
                data.forEach(q => { if (!cache.some(c => c.q === q.q)) cache.push({ ...q, added_at: now }); });
                cache.sort((a, b) => (b.added_at || 0) - (a.added_at || 0)).slice(0, 100);
                localStorage.setItem("cache_quotes", JSON.stringify(cache));
                if (document.getElementById("quotesModal")?.classList.contains("show")) this.showQuotesModal();
            }
        }).catch(() => {});
    }
};

// Global exports
window.showQuotes = () => QuotesManager.showQuotesModal();
window.copyQuote = (i) => QuotesManager.copyQuote(i);
window.refreshQuotes = () => QuotesManager.refreshQuotes();
window.QuotesManager = QuotesManager;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => QuotesManager.init());

})();
