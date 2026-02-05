(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[App]', ...args);
        }
    }

/**
 * Global Application Module
 * Core utility functions and base application lifecycle management.
 */
const App = {
    /**
     * Utility functions for network, session, and UI helpers.
     */
    utils: {
        /**
         * Enhanced fetch with automatic retry and emergency auth validation.
         * @param {string} url - Target endpoint.
         * @param {Object} options - Fetch configuration.
         * @param {number} retries - Max retry attempts.
         * @param {number} delay - Base delay between retries.
         */
        async fetchWithRetry(url, options, retries = 3, delay = 1e3) {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    
                    // Handle authentication failures
                    if (response.status === 401 || response.status === 403) {
                        console.warn(`[App] Auth failure on ${url}. Validating session...`);
                        const isValid = await App.utils.emergencyValidation();
                        if (isValid === false) throw new Error("Unauthorized");
                        
                        ErrorManager.showToast(`${url} unresponsive. Using cached data.`, "warning");
                        throw new Error("EndpointError");
                    }

                    if (!response.ok && response.status >= 500) {
                        throw new Error(`Server Error: ${response.status}`);
                    }

                    const data = await response.json();
                    if (typeof ErrorManager !== "undefined") {
                        ErrorManager.handleApiResponse(data);
                    }
                    return data;
                } catch (err) {
                    if (err.message === "Unauthorized" || err.message === "EndpointError") throw err;
                    
                    console.warn(`[App] Attempt ${i + 1} failed for ${url}: ${err.message}`);
                    if (i < retries - 1) {
                        await new Promise(res => setTimeout(res, delay));
                    } else {
                        const isValid = await App.utils.emergencyValidation();
                        if (isValid === true) {
                            ErrorManager.showToast(`${url} is currently unresponsive.`, "warning");
                            throw new Error("EndpointError");
                        } else if (isValid === false) {
                            throw new Error("Unauthorized");
                        } else {
                            ErrorManager.showToast(`Network connectivity issue.`, "warning");
                            throw new Error("EndpointError");
                        }
                    }
                }
            }
        },

        /**
         * Checks authentication status across multiple fallback endpoints.
         * @returns {Promise<boolean|null>} True if valid, false if unauthorized, null if network error.
         */
        async emergencyValidation() {
            const jwt = localStorage.getItem("by_jwt");
            if (!jwt) return false;

            const endpoints = ["/api/validate_token", "/api/user"];
            let networkErrorCount = 0;
            let authFailureCount = 0;

            for (const ep of endpoints) {
                try {
                    const response = await fetch(ep, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token: jwt })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.valid || data.network_name) return true;
                    } else if (response.status === 401 || response.status === 403) {
                        authFailureCount++;
                    } else {
                        // Response is not OK, but not strictly auth failure (e.g. 400, 500)
                        networkErrorCount++; 
                    }
                } catch (err) {
                    networkErrorCount++;
                }
            }

            if (authFailureCount > 0) return false;
            if (networkErrorCount > 0) return null; // If we had ANY network/server errors and no auth failures, assume network issue
            return false;
        },

        /**
         * Checks if the current session is within its valid TTL.
         * @returns {boolean}
         */
        isSessionValid() {
            const expiry = localStorage.getItem("session_expiry");
            const jwt = localStorage.getItem("by_jwt");
            return !!(jwt && expiry && Date.now() < parseInt(expiry));
        },

        /**
         * Extends the current session expiry.
         */
        refreshSession() {
            localStorage.setItem("session_expiry", Date.now() + 36e5); // +1 hour
        },

        /**
         * Retrieves data from cache with an optional validator.
         * @param {string} key - Cache identifier.
         * @param {Function} validator - Optional validation logic.
         * @returns {Object|null}
         */
        getCache(key, validator) {
            const data = localStorage.getItem(`cache_${key}_data`);
            const expiry = localStorage.getItem(`cache_${key}_expiry`);
            
            if (!data || !expiry || Date.now() > parseInt(expiry)) return null;

            try {
                const parsed = JSON.parse(data);
                if (validator && !validator(parsed)) return null;
                return parsed;
            } catch (err) {
                console.error(`[App] Cache parse error for ${key}:`, err);
                return null;
            }
        },

        /**
         * Saves data to cache with a specified TTL.
         * @param {string} key - Cache identifier.
         * @param {Object} data - Data to store.
         * @param {number} ttl - Time to live in ms.
         */
        setCache(key, data, ttl = 9e5) {
            localStorage.setItem(`cache_${key}_data`, JSON.stringify(data));
            localStorage.setItem(`cache_${key}_expiry`, Date.now() + ttl);
        },

        /**
         * Formats bytes into human-readable strings.
         * @param {number} size - Value in bytes.
         * @returns {string}
         */
        formatBytes(size) {
            if (size === 0) return "0.00 Bytes";
            const units = ["Bytes", "KB", "MB", "GB", "TB"];
            const i = Math.floor(Math.log(size) / Math.log(1000));
            return (size / Math.pow(1000, i)).toFixed(2) + " " + units[i];
        },

        /**
         * Helper to wait for all images in a container to load.
         */
        waitForImages(container) {
            const imgs = container.querySelectorAll("img");
            if (imgs.length === 0) return Promise.resolve();
            return Promise.all(Array.from(imgs).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(res => { img.onload = res; img.onerror = res; });
            }));
        },

        showToast(message, type = "info") {
            return ErrorManager.showToast(message, type);
        },

        showCountdownToast(message, seconds, type = "warning") {
            return ErrorManager.showCountdownToast(message, seconds, type);
        }
    },

    /**
     * Base application logic and UI orchestration.
     */
    base: {
        /**
         * Initializes core application services.
         */
        init: () => {
            console.log("[App] Initializing core services...");
            ErrorManager.toastManager.init();
            App.base.updateNavVisibility();
            
            if (document.getElementById("nav-login")) {
                App.base.updateAuthNav();
                window.addEventListener("storage", App.base.updateAuthNav);
            }
            
            if (document.getElementById("storage-display")) {
                App.base.updateStorageDisplay();
                window.addEventListener("storage", App.base.updateStorageDisplay);
            }

            App.base.initTheme();
            App.base.initDropdownHover();
            App.base.startCountdown();
            App.base.initHeader();
            App.base.initGlobalModalHandler();
        },

        /**
         * Global handler to fix accessibility issues with Bootstrap modals.
         * Ensures aria-hidden is removed before focus shifts.
         */
        initGlobalModalHandler: () => {
             document.addEventListener('show.bs.modal', function (event) {
                 const modal = event.target;
                 // Remove aria-hidden immediately when show process starts
                 modal.removeAttribute('aria-hidden');
                 modal.setAttribute('aria-modal', 'true');
                 modal.setAttribute('role', 'dialog');
             }, true); // Use capture phase to catch it early

             // Double-check when fully shown
             document.addEventListener('shown.bs.modal', function (event) {
                 const modal = event.target;
                 modal.removeAttribute('aria-hidden');
                 if (modal.hasAttribute('aria-hidden')) {
                     console.warn("Bootstrap reapplied aria-hidden, stripping it again.");
                     modal.removeAttribute('aria-hidden');
                 }
             });

             // CRITICAL FIX: Ensure focus is ejected when modal starts to hide
             document.addEventListener('hide.bs.modal', function (event) {
                 const modal = event.target;
                 if (modal.contains(document.activeElement)) {
                     document.activeElement.blur();
                 }
             }, true);
        },

        /**
         * Configures hover behavior for navigation dropdowns on desktop.
         */
        initDropdownHover: () => {
            const dropdowns = document.querySelectorAll('.dropdown');
            const isDesktop = () => window.innerWidth >= 992;

            dropdowns.forEach(dropdown => {
                let timeoutId;
                const toggleBtn = dropdown.querySelector('.dropdown-toggle');
                const menu = dropdown.querySelector('.dropdown-menu');
                if (!toggleBtn || !menu) return;

                const closeDropdown = (d) => {
                    const t = d.querySelector('.dropdown-toggle');
                    const m = d.querySelector('.dropdown-menu');
                    if (t && m) {
                        t.classList.remove('show');
                        m.classList.remove('show');
                        m.removeAttribute('data-bs-popper');
                    }
                };

                dropdown.addEventListener('mouseenter', () => {
                    if (!isDesktop()) return;
                    clearTimeout(timeoutId);
                    dropdowns.forEach(other => { if (other !== dropdown) closeDropdown(other); });
                    toggleBtn.classList.add('show');
                    menu.classList.add('show');
                    menu.setAttribute('data-bs-popper', 'static');
                });

                dropdown.addEventListener('mouseleave', () => {
                    if (!isDesktop()) return;
                    timeoutId = setTimeout(() => closeDropdown(dropdown), 300);
                });
            });
        },

        /**
         * Initializes the page header with network information.
         */
        initHeader: async () => {
            const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
            const commonHeader = document.getElementById("common-header");
            if (!jwt || !commonHeader) return;

            commonHeader.style.display = "block";
            const cachedName = localStorage.getItem("network_name");
            if (cachedName) {
                const header = document.getElementById("welcome-header");
                if (header) header.textContent = `Network : ${cachedName}`;
            }

            if (App.utils.isSessionValid()) {
                App.base.fetchUser(jwt).catch(err => {
                    if (err.message === "Unauthorized") App.base.logout();
                });
            }
        },

        /**
         * Starts the countdown timer for the next data trigger.
         */
        startCountdown: () => {
            let lastMin = new Date().getMinutes();

            const updateTimer = () => {
                const now = new Date();
                const min = now.getMinutes();
                const sec = now.getSeconds();
                
                // Check for trigger condition (change in minute AND hitting a 15-min mark)
                if (min !== lastMin) {
                    if (min % 15 === 0) {
                        console.log("[App] Trigger condition met (15 min interval).");
                        if (window.StatisticsManager && typeof window.StatisticsManager.refreshData === 'function') {
                            window.StatisticsManager.refreshData();
                        } else {
                            window.location.reload();
                        }
                    }
                    lastMin = min;
                }

                let nextInterval = 60;
                if (min < 15) nextInterval = 15;
                else if (min < 30) nextInterval = 30;
                else if (min < 45) nextInterval = 45;

                let diffMin = nextInterval - min - 1;
                let diffSec = 60 - sec;
                
                if (diffSec === 60) {
                    diffSec = 0;
                    diffMin += 1;
                }

                const timerEl = document.getElementById("refresh-timer");
                if (timerEl) {
                    timerEl.textContent = `Next Trigger in : ${diffMin.toString().padStart(2, "0")}:${diffSec.toString().padStart(2, "0")}`;
                }
            };
            updateTimer();
            setInterval(updateTimer, 1000);
        },

        /**
         * Logs out the user and clears session data.
         */
        logout: () => {
            console.log("[App] Logging out...");
            localStorage.removeItem("by_jwt");
            localStorage.removeItem("jwt");
            localStorage.removeItem("session_expiry");
            window.location.href = "/";
        },

        /**
         * Updates navigation visibility based on auth state.
         */
        updateAuthNav: () => {
            const token = localStorage.getItem("by_jwt");
            const loginNav = document.getElementById("nav-login");
            const logoutNav = document.getElementById("nav-logout");
            if (!loginNav || !logoutNav) return;

            if (token) {
                loginNav.classList.add("d-none");
                logoutNav.style.display = "block";
            } else {
                loginNav.classList.remove("d-none");
                logoutNav.style.display = "none";
            }
        },

        /**
         * Updates global navigation link visibility.
         */
        updateNavVisibility: () => {
            const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
            const navLinks = document.getElementById("nav-links");
            const navLogin = document.getElementById("nav-login");
            const navLogout = document.getElementById("nav-logout");
            
            if (jwt) {
                if (navLinks) navLinks.style.display = "flex";
                if (navLogin) navLogin.style.display = "none";
                if (navLogout) navLogout.style.display = "block";
            } else {
                if (navLinks) navLinks.style.display = "none";
                if (navLogin) navLogin.style.display = "block";
                if (navLogout) navLogout.style.display = "none";
            }
        },

        /**
         * Fetches user-specific data from the server.
         */
        fetchUser: async jwt => {
            try {
                const data = await App.utils.fetchWithRetry("/api/user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: jwt })
                });

                if (data.network_error) return { valid: true };
                if (data.valid) {
                    if (data.network_name) {
                        localStorage.setItem("network_name", data.network_name);
                        const header = document.getElementById("welcome-header");
                        if (header) header.textContent = `Network : ${data.network_name}`;
                    }
                    return data;
                }
                throw new Error(data.reason || "Unauthorized");
            } catch (err) {
                if (err.message === "EndpointError") return { valid: true };
                console.error("[App] Failed to fetch user:", err);
                if (App.utils && ErrorManager.showToast) ErrorManager.showToast(err.message, "danger");
                throw err;
            }
        },

        /**
         * Theme management and initialization.
         */
        initTheme: () => {
            const currentTheme = localStorage.getItem("theme") || "dark";
            App.base.setTheme(currentTheme);
        },

        setTheme: theme => {
            localStorage.setItem("theme", theme);
            let effectiveTheme = theme;
            if (theme === "auto") {
                effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
            }
            document.documentElement.setAttribute("data-bs-theme", effectiveTheme);
            App.base.updateNavFooterTheme(effectiveTheme);
            App.base.updateThemeActiveState(theme);
        },

        updateNavFooterTheme: theme => {
            const nav = document.querySelector("nav");
            const footer = document.querySelector("footer");
            if (theme === "dark") {
                if (nav) { nav.classList.remove("navbar-light", "bg-light"); nav.classList.add("navbar-dark", "bg-dark"); }
                if (footer) { footer.classList.remove("bg-light"); footer.classList.add("bg-dark"); }
            } else {
                if (nav) { nav.classList.remove("navbar-dark", "bg-dark"); nav.classList.add("navbar-light", "bg-light"); }
                if (footer) { footer.classList.remove("bg-dark"); footer.classList.add("bg-light"); }
            }
        },

        updateThemeActiveState: theme => {
            document.querySelectorAll('[onclick^="setTheme"]').forEach(el => el.classList.remove('active'));
            const activeItem = document.querySelector(`[onclick="setTheme('${theme}')"]`);
            if (activeItem) activeItem.classList.add('active');
        },

        /**
         * Storage visualization helpers.
         */
        updateStorageDisplay: () => {
            let used = 0;
            for (let x in localStorage) {
                if (localStorage.hasOwnProperty(x)) used += (localStorage[x].length + x.length) * 2;
            }
            const usedKB = (used / 1024).toFixed(2);
            const display = document.getElementById("storage-display");
            if (display) display.textContent = `LocalStorage: ${usedKB}KB / 5120KB`;
        },

        confirmClearStorage: async () => {
            // Save statistics before clearing
            const stats = localStorage.getItem("data_statistics");

            localStorage.clear();

            // Restore statistics
            if (stats) {
                localStorage.setItem("data_statistics", stats);
            }

            App.base.updateStorageDisplay();
            App.base.updateAuthNav();
            const modalEl = document.getElementById("clearStorageModal");
            if (modalEl && window.bootstrap) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            await new Promise(res => setTimeout(res, 1000));
            
            // Second clear pass (preserving stats)
            localStorage.clear();
            if (stats) {
                localStorage.setItem("data_statistics", stats);
            }
            
            window.location.href = "/";
        },

        clearSpecificCache: type => {
            if (type === "quotes") localStorage.removeItem("cache_quotes");
            else if (type === "statistics") localStorage.removeItem("data_statistics");
            else {
                localStorage.removeItem(`cache_${type}_data`);
                localStorage.removeItem(`cache_${type}_expiry`);
            }
            App.base.updateStorageDisplay();
            window.location.reload();
        },

        showSpecificClearModal: type => {
            const modalEl = document.getElementById("clearSpecificModal");
            const nameEl = document.getElementById("specific-cache-name");
            const btnEl = document.getElementById("confirmSpecificBtn");
            if (!modalEl || !nameEl || !btnEl) return;
            
            nameEl.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            btnEl.onclick = () => App.base.clearSpecificCache(type);
            
            if (window.bootstrap) {
                const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.show();
            }
        },

        showToken: () => {
            const jwt = localStorage.getItem("by_jwt");
            const modalEl = document.getElementById("showTokenModal");
            const display = document.getElementById("jwt-token-display");
            if (!modalEl || !display) return;

            if (jwt) {
                display.dataset.token = jwt;
                display.textContent = "•".repeat(jwt.length);
            } else {
                display.dataset.token = "";
                display.textContent = "No token found. Please login.";
            }
            display.dataset.visible = "false";
            
            if (window.bootstrap) {
                const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.show();
            }
        }
    },

    /**
     * Top-level application initialization.
     */
    init: () => {
        console.log("[App] Bootstrapping application...");
        App.base.init();
    }
};

// Global exports for UI interactions
window.logout = App.base.logout;
window.confirmClearStorage = App.base.confirmClearStorage;
window.clearSpecificCache = App.base.clearSpecificCache;
window.setTheme = App.base.setTheme;
window.showSpecificClearModal = App.base.showSpecificClearModal;
window.showToken = App.base.showToken;

window.toggleTokenVisibility = () => {
    const display = document.getElementById("jwt-token-display");
    const icon = document.getElementById("token-eye-icon");
    const text = document.getElementById("token-eye-text");
    if (!display) return;
    const token = display.dataset.token || "";
    const visible = display.dataset.visible === "true";
    if (!token) return;
    
    if (visible) {
        display.textContent = "•".repeat(token.length);
        display.dataset.visible = "false";
        if (icon) icon.className = "bi bi-eye";
        if (text) text.textContent = "Show";
    } else {
        display.textContent = token;
        display.dataset.visible = "true";
        if (icon) icon.className = "bi bi-eye-slash";
        if (text) text.textContent = "Hide";
    }
};

window.copyTokenToClipboard = () => {
    const display = document.getElementById("jwt-token-display");
    const token = display ? display.dataset.token : "";
    if (!token) return;

    const fallback = (t) => {
        const area = document.createElement("textarea");
        area.value = t;
        area.style.position = "fixed"; area.style.left = "-9999px";
        document.body.appendChild(area);
        area.focus(); area.select();
        try {
            if (document.execCommand('copy')) ErrorManager.showToast("Token copied!", "success");
        } catch (e) {}
        document.body.removeChild(area);
    };

    if (!navigator.clipboard) { fallback(token); return; }
    navigator.clipboard.writeText(token)
        .then(() => ErrorManager.showToast("Token copied!", "success"))
        .catch(() => fallback(token));
};

// Global security event listener
document.addEventListener("keydown", e => {
    const modal = document.getElementById("showTokenModal");
    if (modal?.classList.contains("show") && (e.ctrlKey || e.metaKey) && e.key === "c") {
        if (window.getSelection().toString().length > 0) {
            e.preventDefault();
            ErrorManager.showToast("Use the Copy button for security", "warning");
        }
    }
});

document.addEventListener("DOMContentLoaded", App.init);

window.logout = App.base.logout;

window.confirmClearStorage = App.base.confirmClearStorage;

window.clearSpecificCache = App.base.clearSpecificCache;

window.setTheme = App.base.setTheme;

window.showSpecificClearModal = App.base.showSpecificClearModal;

window.showToken = App.base.showToken;

window.toggleTokenVisibility = () => {
    const tokenDisplay = document.getElementById("jwt-token-display");
    const eyeIcon = document.getElementById("token-eye-icon");
    const eyeText = document.getElementById("token-eye-text");
    if (!tokenDisplay) return;
    const actualToken = tokenDisplay.dataset.token || "";
    const isVisible = tokenDisplay.dataset.visible === "true";
    if (!actualToken || actualToken === "") {
        ErrorManager.showToast("No token to toggle", "warning");
        return;
    }
    if (isVisible) {
        tokenDisplay.textContent = "•".repeat(actualToken.length);
        tokenDisplay.dataset.visible = "false";
        if (eyeIcon) eyeIcon.className = "bi bi-eye";
        if (eyeText) eyeText.textContent = "Show";
    } else {
        tokenDisplay.textContent = actualToken;
        tokenDisplay.dataset.visible = "true";
        if (eyeIcon) eyeIcon.className = "bi bi-eye-slash";
        if (eyeText) eyeText.textContent = "Hide";
    }
};

window.copyTokenToClipboard = () => {
    const tokenDisplay = document.getElementById("jwt-token-display");
    const actualToken = tokenDisplay ? tokenDisplay.dataset.token : "";
    if (!actualToken || actualToken === "") {
        ErrorManager.showToast("No token to copy", "warning");
        return;
    }

    const performFallbackCopy = (text) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        
        // Ensure textarea is not visible but part of DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.setAttribute('readonly', '');
        
        // Append to the modal body to avoid focus trap issues
        const modalBody = document.querySelector('#showTokenModal .modal-body') || document.body;
        modalBody.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, 99999); // For mobile

        try {
            const successful = document.execCommand('copy');
            modalBody.removeChild(textArea);
            if (successful) {
                ErrorManager.showToast("Token copied to clipboard!", "success");
            } else {
                throw new Error("execCommand returned false");
            }
        } catch (err) {
            if (textArea.parentNode) modalBody.removeChild(textArea);
            console.error("Fallback copy failed:", err);
            ErrorManager.showToast("Copy failed. Please select text and right-click to copy.", "warning");
        }
    };

    if (!navigator.clipboard) {
        performFallbackCopy(actualToken);
        return;
    }

    navigator.clipboard.writeText(actualToken)
        .then(() => {
            ErrorManager.showToast("Token copied to clipboard!", "success");
        })
        .catch((err) => {
            console.warn("Clipboard API failed, attempting fallback...", err);
            performFallbackCopy(actualToken);
        });
};

document.addEventListener("keydown", e => {
    const modal = document.getElementById("showTokenModal");
    if (modal && modal.classList.contains("show")) {
        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            const selection = window.getSelection().toString();
            if (selection.length > 0) {
                e.preventDefault();
                ErrorManager.showToast("Please use the Copy to Clipboard button for security", "warning");
            }
        }
    }
});

document.addEventListener("DOMContentLoaded", App.init);

    window.App = App;
})();