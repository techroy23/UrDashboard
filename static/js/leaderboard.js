(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[Leaderboard]', ...args);
        }
    }

/**
 * Leaderboard Module
 * Manages the fetching, caching, and visualization of the network-wide transfer leaderboard.
 */
const D3Leaderboard = {
    /**
     * Internal state management
     */
    state: {
        data: [],
        ranking: null
    },

    /**
     * Initializes the leaderboard module, checks authentication, and handles data loading.
     */
    init: async () => {
        const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
        if (!jwt) {
            window.location.href = "/";
            return;
        }

        console.log("[Leaderboard] Initializing Leaderboard...");
        
        // Attempt to retrieve data from cache
        let cached = null;
        if (window.App && window.App.utils) {
            cached = App.utils.getCache("leaderboard", data => data && data.leaderboard && Array.isArray(data.leaderboard) && data.leaderboard.length > 0);
        } else {
            const data = localStorage.getItem("cache_leaderboard_data");
            const expiry = localStorage.getItem("cache_leaderboard_expiry");
            if (data && expiry && Date.now() < parseInt(expiry)) {
                cached = JSON.parse(data);
            }
        }

        if (cached) {
            console.log("[Leaderboard] Using valid cache.");
            D3Leaderboard.state.data = cached.leaderboard;
            D3Leaderboard.state.ranking = cached.ranking;
            D3Leaderboard.renderRanking(cached.ranking);
            D3Leaderboard.renderTable(cached.leaderboard, cached.ranking.network_name);
            D3Leaderboard.renderD3BubbleChart();
            return;
        }

        // Fetch fresh data from API
        try {
            let result;
            const payload = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: jwt }) };
            
            if (window.App && window.App.utils) {
                result = await App.utils.fetchWithRetry("/api/leaderboard", payload);
            } else {
                const response = await fetch("/api/leaderboard", payload);
                result = await response.json();
            }

            if (result.network_error) {
                console.warn("[Leaderboard] Network error during fetch.");
                if (typeof ErrorManager !== "undefined") ErrorManager.showToast("Network issue. Please try again later.", "warning");
                
                const emergencyCache = localStorage.getItem("cache_leaderboard_data");
                if (emergencyCache) {
                    try {
                        const parsed = JSON.parse(emergencyCache);
                        console.warn("[Leaderboard] Using expired cache due to network error.");
                        D3Leaderboard.state.data = parsed.leaderboard;
                        D3Leaderboard.state.ranking = parsed.ranking;
                        D3Leaderboard.renderRanking(parsed.ranking);
                        D3Leaderboard.renderTable(parsed.leaderboard, parsed.ranking.network_name);
                        D3Leaderboard.renderD3BubbleChart();
                    } catch (err) {
                        console.error("[Leaderboard] Cache corrupt:", err);
                    }
                }
            } else if (result.valid) {
                if (window.App && window.App.utils) {
                    App.utils.setCache("leaderboard", result);
                } else {
                    localStorage.setItem("cache_leaderboard_data", JSON.stringify(result));
                    localStorage.setItem("cache_leaderboard_expiry", Date.now() + 18e5);
                }
                D3Leaderboard.state.data = result.leaderboard;
                D3Leaderboard.state.ranking = result.ranking;
                D3Leaderboard.renderRanking(result.ranking);
                D3Leaderboard.renderTable(result.leaderboard, result.ranking.network_name);
                D3Leaderboard.renderD3BubbleChart();
            } else {
                const errorMsg = result.reason || "Failed to load leaderboard.";
                console.error("[Leaderboard] Error:", errorMsg);
                if (typeof ErrorManager !== "undefined") ErrorManager.showToast(errorMsg, "danger");
            }
        } catch (err) {
            if (err.message === "Unauthorized") {
                if (window.App && window.App.base) App.base.logout();
                else {
                    localStorage.removeItem("by_jwt");
                    window.location.href = "/";
                }
            } else {
                if (typeof ErrorManager !== "undefined") ErrorManager.showToast("Network issue. Please try again later.", "warning");
                const emergencyCache = localStorage.getItem("cache_leaderboard_data");
                if (emergencyCache) {
                    try {
                        const parsed = JSON.parse(emergencyCache);
                        console.warn("[Leaderboard] Using expired cache due to backend latency.");
                        D3Leaderboard.state.data = parsed.leaderboard;
                        D3Leaderboard.state.ranking = parsed.ranking;
                        D3Leaderboard.renderRanking(parsed.ranking);
                        D3Leaderboard.renderTable(parsed.leaderboard, parsed.ranking.network_name);
                        D3Leaderboard.renderD3BubbleChart();
                    } catch (err) {
                        console.error("[Leaderboard] Cache corrupt:", err);
                    }
                }
            }
        }
    },

    /**
     * Renders the user's specific ranking summary.
     * @param {Object} ranking - The user's ranking data.
     */
    renderRanking: ranking => {
        const rankEl = document.getElementById("user-rank");
        const transferEl = document.getElementById("user-transfer");
        if (rankEl) rankEl.innerHTML = `<h2 class="mb-0">#${ranking.leaderboard_rank || "N/A"}</h2>`;
        if (transferEl) transferEl.innerHTML = `<h2 class="mb-0">${ranking.formatted_transfer || "0 Bytes"}</h2>`;
    },

    /**
     * Renders the global leaderboard table.
     * @param {Array} earners - List of top earners.
     * @param {string} userNetworkName - The current user's network name for highlighting.
     */
    renderTable: (earners, userNetworkName) => {
        const tbody = document.getElementById("leaderboardTableBody");
        if (!tbody) return;
        if (!earners || earners.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center">No leaderboard data available.</td></tr>';
            return;
        }
        tbody.innerHTML = earners.map((earner, index) => {
            const rank = index + 1;
            const isUser = userNetworkName && earner.network_name === userNetworkName;
            const name = earner.network_name && earner.network_name.trim() ? earner.network_name : '<span class="text-muted italic">[redacted]</span>';
            const transfer = earner.formatted_transfer || "0 Bytes";
            return `
                <tr class="${isUser ? "table-primary fw-bold border-2 border-primary" : ""}">
                    <td class="fw-bold text-primary">#${rank}</td>
                    <td>${name} ${isUser ? '<span class="badge bg-primary ms-2">You</span>' : ""}</td>
                    <td class="text-end fw-mono">${transfer}</td>
                </tr>
            `;
        }).join("");
    },

    /**
     * Renders a D3.js bubble chart for network distribution.
     */
    renderD3BubbleChart: () => {
        const loader = document.getElementById("bubble-chart-loader");
        const container = document.getElementById("bubble-chart-container");
        const chartDiv = document.getElementById("d3-bubble-chart");
        
        if (!chartDiv) return;
        if (loader) loader.style.display = "none";
        if (container) container.style.display = "block";
        if (typeof d3 === 'undefined') return;

        d3.select("#d3-bubble-chart").selectAll("*").remove();
        
        const earners = D3Leaderboard.state?.data || [];
        if (earners.length === 0) {
            chartDiv.innerHTML = '<div class="text-center text-muted py-5">No leaderboard data available</div>';
            return;
        }

        const width = chartDiv.offsetWidth;
        const height = 500;
        const svg = d3.select("#d3-bubble-chart").append("svg").attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]);
        const tooltip = d3.select("body").append("div").attr("class", "chart-tooltip").style("position", "absolute").style("visibility", "hidden").style("background-color", "rgba(0, 0, 0, 0.8)").style("color", "white").style("padding", "10px").style("border-radius", "5px").style("font-size", "12px").style("pointer-events", "none").style("z-index", "10000");

        const packData = {
            name: "root",
            children: earners.map((earner, index) => {
                const rank = index + 1;
                const networkName = earner.network_name && earner.network_name.trim() ? earner.network_name : "[redacted]";
                const isCurrentUser = D3Leaderboard.state.ranking?.network_name && earner.network_name === D3Leaderboard.state.ranking.network_name;
                return {
                    name: `#${rank} ${networkName}`,
                    displayName: networkName,
                    value: earner.net_mib_count || 0,
                    rank,
                    formatted_transfer: earner.formatted_transfer || "0 Bytes",
                    isCurrentUser
                };
            }).filter(d => d.value > 0)
        };

        if (packData.children.length === 0) {
            chartDiv.innerHTML = '<div class="text-center text-muted py-5">No transfer data available for visualization</div>';
            return;
        }

        const pack = d3.pack().size([width - 20, height - 20]).padding(5);
        const root = d3.hierarchy(packData).sum(d => Math.sqrt(d.value));
        const nodes = pack(root).leaves();

        const bubbles = svg.selectAll("g").data(nodes).join("g").attr("transform", d => `translate(${d.x + 10},${d.y + 10})`);

        bubbles.append("circle").attr("r", 0).attr("fill", d => {
            if (d.data.isCurrentUser) return "#00d4ff";
            if (d.data.rank <= 3) return "#ffd700";
            if (d.data.rank <= 10) return "#c0c0c0";
            if (d.data.rank <= 25) return "#cd7f32";
            return "#6c757d";
        }).attr("opacity", d => d.data.isCurrentUser ? 0.95 : 0.75).attr("stroke", d => {
            if (d.data.isCurrentUser) return "#0099cc";
            if (d.data.rank <= 3) return "#b8860b";
            if (d.data.rank <= 10) return "#808080";
            if (d.data.rank <= 25) return "#8b4513";
            return "#495057";
        }).attr("stroke-width", d => d.data.isCurrentUser ? 4 : 2).style("cursor", "pointer").transition().duration(1000).attr("r", d => d.r);

        bubbles.append("text").attr("text-anchor", "middle").attr("dy", "0.3em").attr("fill", "white").attr("font-size", d => Math.min(d.r / 3.5, 11) + "px").attr("font-weight", "bold").attr("opacity", 0).style("pointer-events", "none").text(d => {
            if (d.r <= 20 && d.data.rank > 10) return "";
            const name = d.data.displayName || d.data.name;
            const maxLen = d.data.rank <= 10 ? 10 : 12;
            return name.length > maxLen ? name.substring(0, maxLen) + "..." : name;
        }).transition().duration(1000).attr("opacity", 1);

        bubbles.append("text").attr("text-anchor", "middle").attr("dy", "1.5em").attr("fill", "white").attr("font-size", d => Math.min(d.r / 4.5, 9) + "px").attr("opacity", 0).style("pointer-events", "none").text(d => (d.r > 35 || d.data.rank <= 10) ? `#${d.data.rank}` : "").transition().duration(1000).attr("opacity", 0.9);

        bubbles.on("mouseover", function(event, d) {
            d3.select(this).select("circle").transition().duration(200).attr("opacity", 1).attr("stroke-width", 4);
            tooltip.style("visibility", "visible").html(`<strong>${d.data.displayName || d.data.name}</strong><br/>Rank: #${d.data.rank}<br/>Transfer: ${d.data.formatted_transfer}`);
        }).on("mousemove", function(event) {
            tooltip.style("top", event.pageY - 10 + "px").style("left", event.pageX + 10 + "px");
        }).on("mouseout", function(event, d) {
            d3.select(this).select("circle").transition().duration(200).attr("opacity", d.data.isCurrentUser ? 0.95 : 0.75).attr("stroke-width", d.data.isCurrentUser ? 4 : 2);
            tooltip.style("visibility", "hidden");
        });

        // Add "You" indicator if current user is present
        const userBubble = nodes.find(n => n.data.isCurrentUser);
        if (userBubble) {
            const userG = svg.append("g").attr("class", "user-indicator");
            const ix = userBubble.x + 10;
            const iy = userBubble.y + 10 - userBubble.r - 25;
            userG.append("line").attr("x1", ix).attr("y1", iy + 10).attr("x2", ix).attr("y2", userBubble.y + 10 - userBubble.r - 2).attr("stroke", "#00d4ff").attr("stroke-width", 2).attr("opacity", 0).transition().delay(1000).duration(500).attr("opacity", 1);
            userG.append("polygon").attr("points", `${ix},${userBubble.y + 10 - userBubble.r - 2} ${ix - 5},${userBubble.y + 10 - userBubble.r - 10} ${ix + 5},${userBubble.y + 10 - userBubble.r - 10}`).attr("fill", "#00d4ff").attr("opacity", 0).transition().delay(1000).duration(500).attr("opacity", 1);
            userG.append("text").attr("x", ix).attr("y", iy).attr("text-anchor", "middle").attr("fill", "#00d4ff").attr("font-size", "12px").attr("font-weight", "bold").attr("opacity", 0).text("You").transition().delay(1000).duration(500).attr("opacity", 1);
        }

        // Render Legend
        const legend = svg.append("g").attr("transform", `translate(${width - 140}, 20)`);
        const legendData = [
            { label: "You", color: "#00d4ff" },
            { label: "Top 3 (Gold)", color: "#ffd700" },
            { label: "Rank 4-10 (Silver)", color: "#c0c0c0" },
            { label: "Rank 11-25 (Bronze)", color: "#cd7f32" },
            { label: "Others", color: "#6c757d" }
        ];
        legendData.forEach((item, i) => {
            const row = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
            row.append("circle").attr("r", 8).attr("fill", item.color).attr("opacity", 0.75);
            row.append("text").attr("x", 15).attr("y", 4).attr("fill", "rgba(108, 117, 125, 0.9)").attr("font-size", "10px").text(item.label);
        });
    }
};

// Initialize module when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname === '/leaderboard') {
        D3Leaderboard.init();
    }
});

// App-wide initialization compatibility
if (typeof App !== 'undefined' && App.base) {
    const originalInit = App.base.init;
    App.base.init = function() {
        originalInit.apply(this, arguments);
        if (window.location.pathname === '/leaderboard') {
            D3Leaderboard.init();
        }
    };
}

    window.D3Leaderboard = D3Leaderboard;
})();
