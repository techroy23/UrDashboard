(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[Login]', ...args);
        }
    }

/**
 * Login Manager Module
 * Handles user authentication through password or auth code.
 */
const LoginManager = {
    /**
     * Initializes the login form and binds event listeners.
     */
    init: function() {
        console.log("[Login] Initializing Login Manager...");
        const toggleBtn = document.getElementById("toggleModeBtn");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", this.toggleLoginMode.bind(this));
        }
        const loginForm = document.getElementById("loginForm");
        if (loginForm) {
            loginForm.addEventListener("submit", this.handleSubmit.bind(this));
        }
    },

    /**
     * Handles the login form submission.
     * @param {Event} e - The submit event object.
     */
    handleSubmit: async function(e) {
        e.preventDefault();
        const loginBtn = document.getElementById("loginBtn");
        const loginBtnText = document.getElementById("loginBtnText");
        const loginBtnSpinner = document.getElementById("loginBtnSpinner");
        const errorDiv = document.getElementById("login-error");
        const successDiv = document.getElementById("login-success");
        
        // Reset UI state
        loginBtn.disabled = true;
        loginBtnText.classList.add("d-none");
        loginBtnSpinner.classList.remove("d-none");
        errorDiv.classList.add("d-none");
        
        const payload = {
            login_mode: document.getElementById("loginMode").value,
            username: document.getElementById("username").value,
            password: document.getElementById("password").value,
            auth_code: document.getElementById("auth_code").value
        };

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data && data.error) {
                if (typeof ErrorManager !== "undefined") {
                    ErrorManager.handleApiResponse(data);
                }
                
                let errorMsg = typeof data.error === "object" ? data.error.message || "Login failed" : String(data.error);
                if (data.error.status_code && data.error.status_code !== 200) {
                    errorMsg += ` (HTTP ${data.error.status_code})`;
                }
                
                if (data.error.status_code && data.error.status_code >= 200 && data.error.status_code < 500) {
                    errorDiv.classList.replace("alert-danger", "alert-warning");
                } else {
                    errorDiv.classList.replace("alert-warning", "alert-danger");
                }
                
                errorDiv.textContent = errorMsg;
                errorDiv.classList.remove("d-none");
                loginBtn.disabled = false;
                loginBtnText.classList.remove("d-none");
                loginBtnSpinner.classList.add("d-none");
            } else {
                const byJwt = data.by_jwt || data.network?.by_jwt;
                if (byJwt) {
                    localStorage.setItem("by_jwt", byJwt);
                    if (window.App && window.App.utils) {
                        App.utils.refreshSession();
                    }
                    successDiv.classList.remove("d-none");
                    setTimeout(() => {
                        window.location.href = "/";
                    }, 800);
                } else {
                    errorDiv.textContent = "Login failed: No JWT token received.";
                    errorDiv.classList.remove("d-none");
                    loginBtn.disabled = false;
                    loginBtnText.classList.remove("d-none");
                    loginBtnSpinner.classList.add("d-none");
                }
            }
        } catch (err) {
            console.error("[Login] Submission error:", err);
            errorDiv.textContent = "Network error. Please try again.";
            errorDiv.classList.remove("d-none");
            loginBtn.disabled = false;
            loginBtnText.classList.remove("d-none");
            loginBtnSpinner.classList.add("d-none");
        }
    },

    /**
     * Toggles between Username/Password and Auth Code login modes.
     */
    toggleLoginMode: function() {
        const passwordSection = document.getElementById("passwordSection");
        const authCodeSection = document.getElementById("authCodeSection");
        const toggleBtn = document.getElementById("toggleModeBtn");
        const loginModeInput = document.getElementById("loginMode");
        const usernameInput = document.getElementById("username");
        const passwordInput = document.getElementById("password");
        const authCodeInput = document.getElementById("auth_code");
        
        if (passwordSection.classList.contains("d-none")) {
            passwordSection.classList.remove("d-none");
            authCodeSection.classList.add("d-none");
            toggleBtn.textContent = "Switch to Auth Code";
            loginModeInput.value = "password";
            usernameInput.required = true;
            passwordInput.required = true;
            authCodeInput.required = false;
            authCodeInput.value = "";
        } else {
            passwordSection.classList.add("d-none");
            authCodeSection.classList.remove("d-none");
            toggleBtn.textContent = "Switch to Username/Password";
            loginModeInput.value = "auth_code";
            usernameInput.required = false;
            passwordInput.required = false;
            authCodeInput.required = true;
            usernameInput.value = "";
            passwordInput.value = "";
        }
    }
};

// Initialize login module on appropriate page
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/login') {
        LoginManager.init();
    }
});

    window.LoginManager = LoginManager;
})();