(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[Home]', ...args);
        }
    }

/**
 * Home Manager Module
 * Manages the transition between guest and logged-in views on the index page.
 */
const HomeManager = {
    /**
     * Initializes the home page, checks for an active session, and validates tokens.
     */
    init: async function() {
        const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
        const skeletonView = document.getElementById("skeleton-view");
        const guestView = document.getElementById("guest-view");
        const loggedinView = document.getElementById("loggedin-view");
        const guestQuote = document.getElementById("guest-quote");
        
        // No token: show guest view immediately
        if (!jwt) {
            if (skeletonView) skeletonView.style.display = "none";
            if (guestView) guestView.style.display = "block";
            if (loggedinView) loggedinView.style.display = "none";
            if (guestQuote) guestQuote.style.display = "block";
            return;
        }

        // Optimistic check: if session is valid in cache, show logged-in view
        if (window.App && window.App.utils && App.utils.isSessionValid()) {
            console.log("[Home] Optimistic session valid. Showing dashboard.");
            this.showLoggedInView();
            return;
        }

        // Token exists but session is expired or unknown: validate with server
        try {
            let data;
            const payload = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: jwt }) };
            
            if (window.App && window.App.utils) {
                data = await App.utils.fetchWithRetry("/api/validate_token", payload);
            } else {
                const response = await fetch("/api/validate_token", payload);
                data = await response.json();
            }

            if (data.network_error) {
                console.warn("[Home] Network error during validation. Assuming valid for now.");
                this.showLoggedInView();
            } else if (data.valid) {
                console.log("[Home] Session validated successfully.");
                if (window.App && window.App.utils) {
                    App.utils.refreshSession();
                }
                this.showLoggedInView();
            } else {
                console.warn("[Home] Session invalid. Redirecting to logout.");
                if (typeof ErrorManager !== "undefined") {
                    const msg = data.reason || data.message || "Session expired. Please log in again.";
                    ErrorManager.showToast(msg, "warning");
                }
                if (window.App && window.App.base) {
                    App.base.logout();
                }
            }
        } catch (err) {
            if (err.message === "EndpointError") {
                console.warn("[Home] Upstream latency. Assuming valid for now.");
                if (window.App && window.App.utils) {
                    App.utils.refreshSession();
                }
                this.showLoggedInView();
            } else {
                console.error("[Home] Session check failed:", err);
                if (skeletonView) skeletonView.style.display = "none";
                if (guestView) guestView.style.display = "block";
                if (loggedinView) loggedinView.style.display = "none";
                if (guestQuote) guestQuote.style.display = "block";
            }
        }
    },

    /**
     * Updates the UI to show the logged-in dashboard view.
     */
    showLoggedInView: function() {
        const skeletonView = document.getElementById("skeleton-view");
        const guestView = document.getElementById("guest-view");
        const loggedinView = document.getElementById("loggedin-view");
        const guestQuote = document.getElementById("guest-quote");
        
        if (skeletonView) skeletonView.style.display = "none";
        if (guestView) guestView.style.display = "none";
        if (loggedinView) loggedinView.style.display = "block";
        if (guestQuote) guestQuote.style.display = "none";
    }
};

// Initialize module when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if home-specific elements are present
    if (document.getElementById("loading-overlay") && document.getElementById("main-content")) {
        HomeManager.init();
    }
});

    window.HomeManager = HomeManager;
})();