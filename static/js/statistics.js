(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[Statistics]', ...args);
        }
    }

/**
 * Statistics Manager Module
 * Handles the retrieval and display of data transfer statistics.
 */
const StatisticsManager = {
    /**
     * Initializes the statistics module, checks authentication, and starts data fetching.
     */
    init: async function() {
        const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
        if (!jwt) {
            window.location.href = "/";
            return;
        }

        console.log("[Statistics] Initializing Statistics Manager...");

        // Fetch initial statistics
        this.fetchStats(jwt).then(() => {
            if (window.App && window.App.utils) {
                App.utils.refreshSession();
            }
        }).catch(err => {
            if (err.message === "Unauthorized") {
                if (window.App && window.App.base) App.base.logout();
            } else {
                const errorMsg = err.message && err.message !== "StatsInvalid" ? err.message : "Failed to load stats. Please try again.";
                console.error("[Statistics] Fetch error:", err);
                if (typeof ErrorManager !== "undefined") ErrorManager.showToast(errorMsg, "danger");
                
                const container = document.getElementById("stats-display");
                if (container) container.innerHTML = `<div class="alert alert-warning">${errorMsg}</div>`;
            }
        });

        // Perform session validation if necessary
        if (window.App && window.App.utils && !App.utils.isSessionValid()) {
            if (window.App.base && typeof App.base.fetchUser === 'function') {
                App.base.fetchUser(jwt).catch(err => {
                    if (err.message === "Unauthorized") App.base.logout();
                });
            }
        }
    },

    /**
     * Fetches statistics data from the API.
     * @param {string} jwt - Authentication token.
     */
    fetchStats: async function(jwt) {
        const container = document.getElementById("stats-display");
        if (!container) return;
        
        try {
            let data;
            if (window.App && window.App.utils) {
                data = await App.utils.fetchWithRetry("/api/stats", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: jwt })
                });
            } else {
                const response = await fetch("/api/stats", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: jwt })
                });
                data = await response.json();
            }

            if (data.network_error) {
                console.warn("[Statistics] Network error during stats fetch.");
                if (typeof ErrorManager !== "undefined") ErrorManager.showToast("Network issue. Please try again later.", "warning");
            } else if (data.valid) {
                this.saveStats(data);
                this.renderStats(data);
            } else {
                const errorMsg = data.reason || "Failed to load stats";
                if (typeof ErrorManager !== "undefined") ErrorManager.showToast(errorMsg, "danger");
                throw new Error(errorMsg);
            }
        } catch (err) {
            if (err.message === "Unauthorized") throw err;
            console.error("[Statistics] Fetch failed:", err);
            if (typeof ErrorManager !== "undefined") ErrorManager.showToast("Network issue. Please try again later.", "warning");
        }
    },

    saveStats: function(data) {
        try {
            const networkName = localStorage.getItem("network_name") || "Unknown Network";
            const newRecord = {
                timestamp: Date.now(),
                network_name: networkName,
                raw_paid: data.paid || 0,
                raw_unpaid: data.unpaid || 0
            };

            let storedStats = [];
            const existingData = localStorage.getItem("data_statistics");
            if (existingData) {
                try {
                    storedStats = JSON.parse(existingData);
                    if (!Array.isArray(storedStats)) storedStats = [];
                } catch (e) {
                    console.error("[Statistics] Failed to parse stored stats, resetting.", e);
                    storedStats = [];
                }
            }

            storedStats.push(newRecord);
            
            // Optional: Limit history size if needed (e.g. keep last 1000 records)
            // if (storedStats.length > 1000) storedStats = storedStats.slice(-1000);

            localStorage.setItem("data_statistics", JSON.stringify(storedStats));
            console.log("[Statistics] Stats saved to local storage.");
            
        } catch (err) {
            console.error("[Statistics] Error saving stats to local storage:", err);
        }
    },

    getLocalStats: function() {
        try {
            const data = localStorage.getItem("data_statistics");
            if (!data) return [];
            return JSON.parse(data);
        } catch (e) {
            console.error("[Statistics] Failed to parse local stats", e);
            return [];
        }
    },

    /**
     * Refreshes data and UI without page reload.
     * Called by the global timer.
     */
    refreshData: async function() {
        console.log("[Statistics] Triggering auto-refresh...");
        const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
        if (!jwt) return;

        try {
            // 1. Fetch User (updates network name if changed, validates session)
            if (window.App && window.App.base) {
                await App.base.fetchUser(jwt);
            }
            
            // 2. Fetch Stats (gets data, saves to local storage, renders UI)
            await this.fetchStats(jwt);
            

        } catch (err) {
            console.error("[Statistics] Auto-refresh failed", err);
        }
    },

    /**
     * Renders statistics data into the UI.
     * @param {Object} data - The statistics data object.
     */
    renderStats: function(data) {
        const container = document.getElementById("stats-display");
        
        // Data comes as raw bytes now.
        const paidBytes = data.paid || 0;
        const unpaidBytes = data.unpaid || 0;
        
        const paidStr = this.formatBytes(paidBytes);
        const unpaidStr = this.formatBytes(unpaidBytes);
        
        container.innerHTML = `
            <div class="row">
                <div class="col-md-6 mb-4">
                    <div class="card glass-card text-center h-100">
                        <div class="card-body">
                            <h6 class="text-muted text-uppercase small fw-bold">Paid Data</h6>
                            <h2 class="mb-0 text-success">${paidStr}</h2>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 mb-4">
                    <div class="card glass-card text-center h-100">
                        <div class="card-body">
                            <h6 class="text-muted text-uppercase small fw-bold">Unpaid Data</h6>
                            <h2 class="mb-0 text-info">${unpaidStr}</h2>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card glass-card mb-4 mt-4">
                <div class="card-body">
                    <h5 class="card-title mb-3">Unpaid Usage Trend</h5>
                    <div id="d3-chart-container" style="width: 100%; height: 400px;"></div>
                </div>
            </div>

            <!-- Data Table Section -->
            <div class="row mt-4">
                <div class="col-12">
                    <div class="card glass-card mb-3">
                        <div class="card-header">Detailed History</div>
                        <div class="card-body">
                            <div class="table-responsive" style="max-height: 35vh; overflow-y: auto;">
                                <table class="table table-hover table-striped mb-0" id="stats-table">
                                    <thead>
                                        <tr>
                                            <th>Timestamp (EST)</th>
                                            <th>Paid Data</th>
                                            <th>Unpaid Data</th>
                                            <th>Delta</th>
                                        </tr>
                                    </thead>
                                    <tbody></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Retrieve real history from local storage
        const allStats = this.getLocalStats();
        const currentNetwork = localStorage.getItem("network_name") || "Unknown Network";

        // Filter by current network name to ensure multi-user isolation in the view
        const localStats = allStats.filter(item => item.network_name === currentNetwork);
        
        // Map local storage format to chart format (GB)
        const chartData = localStats.map(item => ({
            timestamp: new Date(item.timestamp),
            unpaidGB: item.raw_unpaid / (1000 ** 3)
        }));
        
        // Sort for chart (ascending by time)
        chartData.sort((a, b) => a.timestamp - b.timestamp);
        
        // Render Chart with REAL data
        this.renderChart(chartData);
        
        // Map local storage format to table format
        const tableData = localStats.map(item => ({
            timestamp: new Date(item.timestamp),
            paidBytes: item.raw_paid,
            unpaidBytes: item.raw_unpaid
        }));

        // Sort for table (descending by time - newest first)
        tableData.sort((a, b) => b.timestamp - a.timestamp);
        
        this.renderTable(tableData);
    },

    formatBytes: function(bytes) {
        if (bytes === 0) return "0 Bytes";
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        // Using 1000 to match previous Python implementation
        const i = Math.floor(Math.log(bytes) / Math.log(1000));
        return parseFloat((bytes / Math.pow(1000, i)).toFixed(2)) + " " + sizes[i];
    },

    generateMockData: function(currentPaidBytes, currentUnpaidBytes) {
        // Convert to GB for the mock logic so the numbers are manageable for variance
        const toGB = (b) => b / (1000 ** 3);
        const paidTotalGB = toGB(currentPaidBytes);
        const unpaidTotalGB = toGB(currentUnpaidBytes);
        
        const data = [];
        const now = new Date();
        const numPoints = 12;
        
        for (let i = 0; i < numPoints; i++) {
            const time = new Date(now.getTime() - (numPoints - 1 - i) * 60 * 60 * 1000);
            
            const progress = (i + 1) / numPoints;
            const variance = (Math.random() * 0.1) - 0.05;
            
            let paidGB = paidTotalGB * (progress * 0.8 + 0.2 + variance);
            let unpaidGB = unpaidTotalGB * (progress * 0.8 + 0.2 + variance);
            
            paidGB = Math.max(0, Math.min(paidGB, paidTotalGB));
            unpaidGB = Math.max(0, Math.min(unpaidGB, unpaidTotalGB));
            
            if (i === numPoints - 1) {
                paidGB = paidTotalGB;
                unpaidGB = unpaidTotalGB;
            }

            data.push({
                timestamp: time,
                paidGB: parseFloat(paidGB.toFixed(2)),
                unpaidGB: parseFloat(unpaidGB.toFixed(2)),
                // Keep raw bytes for table if needed, but we used GB in previous iteration.
                // Let's store bytes too for accurate table formatting if we want to reverse it,
                // but simpler to just use the GB values for the chart.
                paidBytes: paidGB * (1000 ** 3),
                unpaidBytes: unpaidGB * (1000 ** 3)
            });
        }
        return data;
    },

    renderChart: function(data) {
        const containerId = "#d3-chart-container";
        const container = document.querySelector(containerId);
        if (!container) return;
        
        // Clear previous SVG and Tooltip to prevent duplicates
        container.innerHTML = '';
        d3.selectAll(".d3-tooltip").remove();
        
        const width = container.clientWidth;
        const height = 400;
        const margin = {top: 20, right: 30, bottom: 45, left: 60};

        const svg = d3.select(containerId)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height])
            .style("max-width", "100%")
            .style("height", "auto");

        const x = d3.scaleTime()
            .domain(d3.extent(data, d => d.timestamp))
            .range([margin.left, width - margin.right]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.unpaidGB) * 1.1])
            .nice()
            .range([height - margin.bottom, margin.top]);

        const lineUnpaid = d3.line()
            .x(d => x(d.timestamp))
            .y(d => y(d.unpaidGB))
            .curve(d3.curveMonotoneX);

        const xAxis = svg.append("g")
            .attr("transform", `translate(0,${height - margin.bottom})`)
            .call(d3.axisBottom(x)
                .ticks(Math.max(width / 150, 4)) // Reduced tick density: max 1 tick per 150px, minimum 4
                .tickSizeOuter(0)
                .tickFormat(d3.timeFormat("%m/%d/%y"))
            );
        
        xAxis.selectAll(".tick text")
            .each(function(d) {
                const timeStr = d3.timeFormat("%I:%M %p")(d).toLowerCase();
                d3.select(this).append("tspan")
                    .attr("x", 0)
                    .attr("dy", "1.2em")
                    .style("font-size", "11px") // Slightly smaller font for time
                    .style("fill", "#6c757d")   // Muted color for time
                    .text(timeStr);
            });

        svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y).tickFormat(d => d + " GB"))
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick line").clone()
                .attr("x2", width - margin.left - margin.right)
                .attr("stroke-opacity", 0.1))
            .call(g => g.append("text")
                .attr("x", -margin.left)
                .attr("y", 10)
                .attr("fill", "currentColor")
                .attr("text-anchor", "start")
                .text("Unpaid Data (GB)"));

        svg.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", "#0dcaf0") // Info cyan
            .attr("stroke-width", 3)
            .attr("d", lineUnpaid);

        // --- Interactive Tooltip Implementation ---
        
        const tooltip = d3.select('body').append('div')
            .attr('class', 'd3-tooltip')
            .style('position', 'absolute').style('background', 'rgba(0,0,0,0.85)')
            .style('color', 'white').style('padding', '10px 14px').style('border-radius', '6px')
            .style('font-size', '12px').style('pointer-events', 'none').style('opacity', 0)
            .style('z-index', 1000).style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)');

        const focusLine = svg.append('line').attr('class', 'focus-line')
            .attr('y1', margin.top).attr('y2', height - margin.bottom)
            .attr('stroke', 'rgba(108, 117, 125, 0.5)')
            .attr('stroke-dasharray', '3,3').style('opacity', 0);

        const focusCircle = svg.append('circle')
            .attr('r', 5)
            .attr('fill', '#0dcaf0')
            .style('opacity', 0);

        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Overlay for capturing mouse events
        svg.append('rect')
            .attr('class', 'overlay')
            .attr('width', innerWidth)
            .attr('height', innerHeight)
            .attr('transform', `translate(${margin.left},${margin.top})`)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('mousemove', function(event) {
                const [mx] = d3.pointer(event);
                const x0 = x.invert(mx + margin.left);
                
                const bisect = d3.bisector(d => d.timestamp).left;
                const i = bisect(data, x0, 1);
                const d0 = data[i - 1];
                const d1 = data[i];
                let d = d0;
                
                if (d0 && d1) {
                    d = x0 - d0.timestamp > d1.timestamp - x0 ? d1 : d0;
                } else if (d1) {
                    d = d1;
                }

                if (d) {
                    const cx = x(d.timestamp);
                    const cy = y(d.unpaidGB);

                    focusLine
                        .attr('x1', cx)
                        .attr('x2', cx)
                        .style('opacity', 1);

                    focusCircle
                        .attr('cx', cx)
                        .attr('cy', cy)
                        .style('opacity', 1);

                    const dateLabel = d3.timeFormat("%m/%d/%y")(d.timestamp);
                    const timeLabel = d3.timeFormat("%I:%M %p")(d.timestamp).toLowerCase();
                    
                    let html = `<strong>${dateLabel} ${timeLabel}</strong><br/>`;
                    html += `<span style="color:#0dcaf0">Unpaid: ${d.unpaidGB.toFixed(2)} GB</span>`;

                    tooltip.html(html)
                        .style('left', (event.pageX + 15) + 'px')
                        .style('top', (event.pageY - 10) + 'px')
                        .style('opacity', 1);
                }
            })
            .on('mouseout', function() {
                focusLine.style('opacity', 0);
                focusCircle.style('opacity', 0);
                tooltip.style('opacity', 0);
            });
    },

    renderTable: function(data) {
        const tbody = document.querySelector("#stats-table tbody");
        if (!tbody) return;
        
        tbody.innerHTML = data.map((row, index) => {
            let deltaBytes = 0;
            let deltaStr = "-";
            
            // Calculate Delta: Current Unpaid - Previous (older) Unpaid
            // Since data is sorted newest first (descending), the "previous" entry is at index + 1
            if (index < data.length - 1) {
                const prevRecord = data[index + 1];
                deltaBytes = row.unpaidBytes - prevRecord.unpaidBytes;
                deltaStr = (deltaBytes > 0 ? '+' : '') + this.formatBytes(deltaBytes);
            }
            
            const dateStr = row.timestamp.toLocaleString("en-US", {
                timeZone: "America/New_York",
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            
            return `
                <tr>
                    <td>${dateStr}</td>
                    <td>${this.formatBytes(row.paidBytes)}</td>
                    <td>${this.formatBytes(row.unpaidBytes)}</td>
                    <td class="${deltaBytes > 0 ? 'text-success' : (deltaBytes < 0 ? 'text-danger' : 'text-muted')}">${deltaStr}</td>
                </tr>
            `;
        }).join('');
    }
};

// Initialize module when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/statistics') {
        StatisticsManager.init();
    }
});

    window.StatisticsManager = StatisticsManager;
})();
