(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[ErrorManager]', ...args);
        }
    }

/**
 * Error Manager Module
 * Provides standardized toast notifications and API error handling.
 */
const ErrorManager = {
    /**
     * Internal manager for persistent and non-persistent toast notifications.
     */
    toastManager: {
        storageKey: "persistent_toasts",
        maxToasts: 10,

        /**
         * Initializes the toast manager and starts the countdown timer.
         */
        init() {
            console.log("[ErrorManager] Initializing Toast Manager...");
            this.renderAll();
            setInterval(() => this.updateCountdowns(), 1000);
        },

        /**
         * Loads persisted toasts from local storage.
         * @returns {Array} List of toast objects.
         */
        loadToasts() {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        },

        /**
         * Persists the current toast list to local storage.
         * @param {Array} toasts - List of toast objects.
         */
        saveToasts(toasts) {
            localStorage.setItem(this.storageKey, JSON.stringify(toasts.slice(-this.maxToasts)));
        },

        /**
         * Adds a new toast notification.
         * @param {string} message - Notification text.
         * @param {string} type - Toast theme (info, success, warning, danger).
         * @param {number} countdown - Optional auto-dismiss or retry countdown in seconds.
         * @returns {string} The unique toast ID.
         */
        addToast(message, type = "info", countdown = null) {
            const toast = {
                id: "toast-" + Date.now(),
                message,
                type,
                timestamp: Date.now(),
                countdown: countdown ? {
                    endTime: Date.now() + countdown * 1000,
                    total: countdown
                } : null
            };
            const toasts = this.loadToasts();
            toasts.push(toast);
            this.saveToasts(toasts);
            this.renderAll();
            return toast.id;
        },

        /**
         * Removes a specific toast by ID.
         * @param {string} id - The toast ID.
         */
        removeToast(id) {
            let toasts = this.loadToasts();
            toasts = toasts.filter(t => t.id !== id);
            this.saveToasts(toasts);
            this.renderAll();
        },

        /**
         * Clears all notifications.
         */
        clearAll() {
            localStorage.removeItem(this.storageKey);
            this.renderAll();
        },

        /**
         * Renders the entire toast stack into the DOM.
         */
        renderAll() {
            const toasts = this.loadToasts();
            let container = document.getElementById("toast-stack-container");
            
            if (!container) {
                container = document.createElement("div");
                container.id = "toast-stack-container";
                container.style.cssText = "position: fixed; bottom: 80px; right: 20px; z-index: 9998; display: flex; flex-direction: column-reverse; gap: 10px; pointer-events: none; max-height: 70vh; overflow-y: auto;";
                document.body.appendChild(container);
            }

            let clearBtnContainer = document.getElementById("toast-clear-container");
            if (!clearBtnContainer) {
                clearBtnContainer = document.createElement("div");
                clearBtnContainer.id = "toast-clear-container";
                clearBtnContainer.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 9999; pointer-events: auto;";
                document.body.appendChild(clearBtnContainer);
            }

            container.innerHTML = "";
            toasts.slice().reverse().forEach(toast => {
                container.appendChild(this.createToastElement(toast));
            });

            clearBtnContainer.innerHTML = "";
            if (toasts.length > 0) {
                const btn = document.createElement("div");
                btn.className = "card glass-card show";
                btn.style.cssText = "min-width: 300px; cursor: pointer; pointer-events: auto; border: 1px solid rgba(220, 53, 69, 0.5);";
                btn.innerHTML = `
                    <div class="card-body py-2 px-3 d-flex align-items-center justify-content-between">
                        <span class="fw-bold text-danger"><i class="bi bi-trash me-2"></i>Clear All (${toasts.length})</span>
                        <i class="bi bi-chevron-up text-muted"></i>
                    </div>
                `;
                btn.onclick = () => this.clearAll();
                clearBtnContainer.appendChild(btn);
            }
        },

        /**
         * Creates a DOM element for a single toast.
         * @param {Object} toast - The toast data object.
         * @returns {HTMLElement}
         */
        createToastElement(toast) {
            const div = document.createElement("div");
            div.id = toast.id;
            div.className = "card glass-card show";
            
            const config = {
                info: { icon: "bi-info-circle-fill", border: "rgba(13, 110, 253, 0.5)", text: "text-info", bg: "rgba(13, 110, 253, 0.1)" },
                warning: { icon: "bi-exclamation-triangle-fill", border: "rgba(255, 193, 7, 0.5)", text: "text-warning", bg: "rgba(255, 193, 7, 0.1)" },
                danger: { icon: "bi-exclamation-circle-fill", border: "rgba(220, 53, 69, 0.5)", text: "text-danger", bg: "rgba(220, 53, 69, 0.1)" },
                error: { icon: "bi-exclamation-circle-fill", border: "rgba(220, 53, 69, 0.5)", text: "text-danger", bg: "rgba(220, 53, 69, 0.1)" },
                success: { icon: "bi-check-circle-fill", border: "rgba(25, 135, 84, 0.5)", text: "text-success", bg: "rgba(25, 135, 84, 0.1)" },
                secondary: { icon: "bi-info-circle", border: "rgba(108, 117, 125, 0.5)", text: "text-secondary", bg: "rgba(108, 117, 125, 0.1)" }
            };
            
            const { icon, border, text, bg } = config[toast.type] || config.info;
            div.style.cssText = `min-width: 320px; pointer-events: auto; border: 1px solid ${border}; background-color: ${bg}; backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.1);`;
            
            let msg = toast.message;
            if (toast.countdown) {
                const rem = Math.max(0, Math.ceil((toast.countdown.endTime - Date.now()) / 1000));
                msg += ` <strong class="countdown ${text} ms-2">${rem}s</strong>`;
            }

            div.innerHTML = `
                <div class="card-body py-3 px-3 d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center">
                        <i class="bi ${icon} ${text} fs-4 me-3"></i>
                        <span class="${text} fw-medium" style="font-size: 0.95rem; line-height: 1.4;">${msg}</span>
                    </div>
                    <button type="button" class="btn-close ms-2" style="font-size: 0.8rem;" aria-label="Close"></button>
                </div>
            `;
            div.querySelector(".btn-close").onclick = () => this.removeToast(toast.id);
            return div;
        },

        /**
         * Updates all active countdowns in the DOM.
         */
        updateCountdowns() {
            const toasts = this.loadToasts();
            let updated = false;
            
            toasts.forEach(toast => {
                if (toast.countdown) {
                    const rem = Math.max(0, Math.ceil((toast.countdown.endTime - Date.now()) / 1000));
                    const el = document.querySelector(`#${toast.id} .countdown`);
                    if (el) {
                        el.textContent = rem + "s";
                        if (rem === 0 && !toast.countdown.completed) {
                            el.textContent = "Retrying...";
                            toast.countdown.completed = true;
                            setTimeout(() => {
                                const current = this.loadToasts();
                                const target = current.find(t => t.id === toast.id);
                                if (target) { target.countdown = null; this.saveToasts(current); this.renderAll(); }
                            }, 2000);
                        }
                    }
                    updated = true;
                }
            });
            if (updated) this.saveToasts(toasts);
        }
    },

    showToast(msg, type = "info") { return this.toastManager.addToast(msg, type); },
    showCountdownToast(msg, sec, type = "warning") { return this.toastManager.addToast(msg, type, sec); },

    /**
     * Displays a prioritized error message.
     */
    showError(msg, type = "danger") {
        console.error(`[ErrorManager] ${type.toUpperCase()}: ${msg}`);
        const tType = type === "error" ? "danger" : type;
        if (this.showToast) this.showToast(msg, tType);
        else if (type === "danger" || type === "warning") alert(`${type.toUpperCase()}: ${msg}`);
    },

    /**
     * Standardized handler for API response objects.
     * @param {Object} data - The API response JSON.
     * @returns {boolean} True if an error was handled.
     */
    handleApiResponse(data) {
        if (!data) return false;
        if (data.error === true) {
            let msg = data.message || "Unknown server error";
            if (data.status && data.status !== 200) msg = `[Error ${data.status}] ${msg}`;
            this.showError(msg, (data.status >= 200 && data.status < 500) ? "warning" : "danger");
            return true;
        }
        if (data.valid === false) { this.showError(data.reason || "Operation failed", "warning"); return true; }
        if (data.network_error === true) { this.showError(data.reason || "Network connection failed", "warning"); return true; }
        return false;
    },

    /**
     * Async wrapper with automatic error reporting.
     */
    async try(fn, rethrow = false) {
        try { return await fn(); }
        catch (err) {
            if (err.message !== "Unauthorized") this.showError(err.message || String(err));
            if (rethrow) throw err;
        }
    }
};

window.ErrorManager = ErrorManager;

})();