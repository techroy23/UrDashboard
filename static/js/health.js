(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[Health]', ...args);
        }
    }

/**
 * Health Manager Module
 * Monitors and visualizes the health and latency of the API server.
 */
const HealthManager = {
    /**
     * Internal state management
     */
    state: {
        serverChart: null,
        checkInterval: null,
        currentTimeRangeHours: 336, // Default 14 days
        CACHE_KEY: "health_data",
        MAX_AGE_DAYS: 14,
        TIME_RANGE_KEY: "health_time_range_hours"
    },

    /**
     * Initializes the health monitor, checks authentication, and restores preferences.
     */
    init: async function() {
        const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
        if (!jwt) {
            window.location.href = "/";
            return;
        }

        console.log("[Health] Initializing Health Monitor...");

        // Restore user's preferred time range
        const savedHours = localStorage.getItem(this.state.TIME_RANGE_KEY);
        if (savedHours) {
            this.state.currentTimeRangeHours = parseInt(savedHours);
            this.updateTimeRangeButtons(this.state.currentTimeRangeHours);
        }

        this.initChart();
        
        // Load initial data from cache for immediate rendering
        const cached = this.loadData();
        if (cached.length > 0) {
            this.renderAll();
        }
        
        // Perform initial synchronization with server
        this.syncWithServer();
        
        // Schedule recurring checks aligned with the system clock
        this.scheduleNextCheck();
    },

    /**
     * Schedules the next server synchronization event.
     */
    scheduleNextCheck: function() {
        if (this.state.checkInterval) {
            clearTimeout(this.state.checkInterval);
        }

        const now = new Date();
        const minutes = now.getMinutes();
        
        // Target next 5-minute mark (00, 05, 10...)
        const remainder = minutes % 5;
        const minutesToAdd = 5 - remainder;
        
        const target = new Date(now);
        target.setMinutes(minutes + minutesToAdd);
        target.setSeconds(0);
        target.setMilliseconds(0);
        
        if (target <= now) {
            target.setMinutes(target.getMinutes() + 5);
        }
        
        // Add a 5-second buffer to ensure server-side data is ready
        const delay = (target.getTime() - now.getTime()) + 5000;

        console.log(`[Health] Next sync scheduled for ${new Date(now.getTime() + delay).toLocaleTimeString()} (in ${Math.round(delay/1000)}s)`);

        this.state.checkInterval = setTimeout(() => {
            this.syncWithServer();
            this.scheduleNextCheck(); 
        }, delay);
    },

    /**
     * Synchronizes health data with the server.
     * @param {number} attempt - Current retry attempt number.
     */
    syncWithServer: async function(attempt = 1) {
        try {
            const response = await fetch("/api/health");
            const data = await response.json();
            
            if (Array.isArray(data)) {
                const localData = this.loadData();
                const hasChanges = this.detectChanges(localData, data);

                if (hasChanges) {
                    console.log(`[Health] New data detected on attempt ${attempt}`);
                    localStorage.setItem(this.state.CACHE_KEY, JSON.stringify(data));
                    this.renderAll();
                    this.updateLastSyncLabel();
                } else if (attempt < 10) {
                    const retryDelay = 5000;
                    console.log(`[Health] No changes detected (attempt ${attempt}/10). Retrying in ${retryDelay/1000}s...`);
                    setTimeout(() => this.syncWithServer(attempt + 1), retryDelay);
                } else {
                    console.log(`[Health] No changes after 10 attempts. Waiting for next cycle.`);
                    this.updateLastSyncLabel();
                }
            } else {
                if (typeof ErrorManager !== "undefined") {
                    ErrorManager.showToast("Health data unavailable. Please try again later.", "warning");
                }
            }
        } catch (err) {
            console.error("[Health] Sync failed:", err);
            if (typeof ErrorManager !== "undefined") {
                ErrorManager.showToast("Network issue during health sync.", "warning");
            }
        }
    },

    /**
     * Detects if server data contains updates compared to local data.
     * @param {Array} oldData - Locally cached data.
     * @param {Array} newData - Fresh data from server.
     * @returns {boolean} True if changes are detected.
     */
    detectChanges: function(oldData, newData) {
        if ((!oldData || oldData.length === 0) && (newData && newData.length > 0)) return true;
        if (!newData || newData.length === 0) return false;
        if (oldData.length !== newData.length) return true;
        
        const lastOld = oldData[oldData.length - 1];
        const lastNew = newData[newData.length - 1];
        
        if (!lastOld || !lastNew) return true;
        return lastOld.timestamp !== lastNew.timestamp;
    },

    /**
     * Updates the UI buttons to reflect the current time range selection.
     * @param {number} hours - Selected time range in hours.
     */
    updateTimeRangeButtons: function(hours) {
        const buttons = document.querySelectorAll(".time-filter");
        buttons.forEach(btn => {
            const btnHours = parseInt(btn.dataset.hours);
            if (btnHours === hours) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    },

    /**
     * Initializes the Chart.js instance for latency visualization.
     */
    initChart: function() {
        const serverCtx = document.getElementById("serverChart");
        if (!serverCtx) return;

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: "top",
                    labels: { color: "rgba(108, 117, 125, 0.8)" }
                }
            },
            scales: {
                x: {
                    display: true,
                    ticks: {
                        maxTicksLimit: 12,
                        color: "rgba(108, 117, 125, 0.8)",
                        autoSkip: true,
                        autoSkipPadding: 10
                    },
                    grid: { color: "rgba(108, 117, 125, 0.1)" }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: "Latency (ms)",
                        color: "rgba(108, 117, 125, 0.8)"
                    },
                    ticks: { color: "rgba(108, 117, 125, 0.8)" },
                    grid: { color: "rgba(108, 117, 125, 0.1)" },
                    beginAtZero: true
                }
            },
            elements: {
                line: { tension: .4 },
                point: { radius: 3, hitRadius: 6, hoverRadius: 5 }
            }
        };

        this.state.serverChart = new Chart(serverCtx, {
            type: "line",
            data: {
                labels: [],
                datasets: [{
                    label: "API Latency",
                    data: [],
                    borderColor: "rgb(13, 110, 253)",
                    backgroundColor: "rgba(13, 110, 253, 0.1)",
                    borderWidth: 2,
                    fill: true
                }]
            },
            options: chartOptions
        });
    },

    /**
     * Updates the last sync timestamp label in the UI.
     */
    updateLastSyncLabel: function() {
        const lastCheckEl = document.getElementById("last-check");
        if (lastCheckEl) {
            lastCheckEl.textContent = "Last sync: " + (new Date).toLocaleTimeString();
        }
    },

    /**
     * Retrieves locally cached health data.
     * @returns {Array} List of health check entries.
     */
    loadData: function() {
        const existing = localStorage.getItem(this.state.CACHE_KEY);
        if (!existing) return [];
        try {
            return JSON.parse(existing);
        } catch {
            return [];
        }
    },

    /**
     * Triggers re-rendering of all UI components (chart, summary, table).
     */
    renderAll: function() {
        const allData = this.loadData();
        const filteredData = this.filterDataByTimeRange(allData);
        
        this.updateChart(filteredData);
        this.updateSummary(filteredData);
        this.updateTable(filteredData);
    },

    /**
     * Updates the latency chart with filtered data.
     * @param {Array} data - Filtered health check data.
     */
    updateChart: function(data) {
        if (!this.state.serverChart) return;
        
        const hours = this.state.currentTimeRangeHours;
        let targetDataPoints;
        
        if (hours === 1) targetDataPoints = 12;
        else if (hours === 3) targetDataPoints = 36;
        else targetDataPoints = 72;

        let aggregationMinutes = Math.round(hours * 60 / targetDataPoints);
        if (aggregationMinutes < 1) aggregationMinutes = 1;

        const displayData = this.aggregateData(data, aggregationMinutes);

        const labels = displayData.map(d => {
            const date = new Date(d.timestamp);
            const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
            const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return [dateStr, timeStr];
        });

        const values = displayData.map(d => d.latency > 0 ? d.latency : null);

        this.state.serverChart.data.labels = labels;
        this.state.serverChart.data.datasets[0].data = values;
        this.state.serverChart.update("none");
    },

    /**
     * Aggregates fine-grained data into buckets for better chart performance.
     * @param {Array} data - Raw health check data.
     * @param {number} intervalMinutes - Aggregation bucket size in minutes.
     * @returns {Array} Aggregated data points.
     */
    aggregateData: function(data, intervalMinutes) {
        if (!data || data.length === 0) return [];
        
        const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
        const buckets = {};
        const intervalMs = intervalMinutes * 60 * 1000;

        sorted.forEach(entry => {
            const bucketTimestamp = Math.floor(entry.timestamp / intervalMs) * intervalMs;
            if (!buckets[bucketTimestamp]) {
                buckets[bucketTimestamp] = {
                    timestamps: [],
                    latencies: [],
                    errors: 0,
                    total: 0
                };
            }
            buckets[bucketTimestamp].timestamps.push(entry.timestamp);
            buckets[bucketTimestamp].total++;
            if (entry.latency > 0) {
                buckets[bucketTimestamp].latencies.push(entry.latency);
            } else {
                buckets[bucketTimestamp].errors++;
            }
        });

        return Object.keys(buckets).map(timestamp => {
            const bucket = buckets[timestamp];
            const numericTimestamp = parseInt(timestamp);
            const avgTimestamp = bucket.timestamps.length > 0 
                ? bucket.timestamps[Math.floor(bucket.timestamps.length / 2)] 
                : numericTimestamp;
            
            let avgLatency = -1;
            if (bucket.latencies.length > 0) {
                avgLatency = Math.round(bucket.latencies.reduce((a, b) => a + b, 0) / bucket.latencies.length);
            }

            return {
                timestamp: avgTimestamp,
                latency: avgLatency,
                source: "server",
                status: avgLatency > 0 ? "success" : "error",
                count: bucket.total,
                successCount: bucket.latencies.length,
                errorCount: bucket.errors
            };
        }).sort((a, b) => a.timestamp - b.timestamp);
    },

    /**
     * Updates the summary statistics (average latency, success rate).
     * @param {Array} data - Filtered health check data.
     */
    updateSummary: function(data) {
        const successData = data.filter(d => d.latency > 0).map(d => d.latency);
        const avgLatency = successData.length > 0 
            ? Math.round(successData.reduce((a, b) => a + b, 0) / successData.length) 
            : 0;
        
        const totalChecks = data.length;
        const successRate = totalChecks > 0 
            ? Math.round(successData.length / totalChecks * 100) 
            : 0;

        const serverAvgEl = document.getElementById("server-avg");
        const successRateEl = document.getElementById("success-rate");
        const timeRangeEl = document.getElementById("latency-time-range");

        if (serverAvgEl) serverAvgEl.innerHTML = avgLatency > 0 ? `${avgLatency} ms` : '<span class="text-muted">No data</span>';
        if (successRateEl) successRateEl.textContent = `${successRate}%`;
        
        if (timeRangeEl) {
            const hours = this.state.currentTimeRangeHours;
            const labels = {
                1: "(1 Hour)", 3: "(3 Hours)", 6: "(6 Hours)", 12: "(12 Hours)",
                24: "(24 Hours)", 72: "(3 Days)", 168: "(7 Days)", 336: "(14 Days)"
            };
            timeRangeEl.textContent = labels[hours] || `(${hours} Hours)`;
        }
    },

    /**
     * Updates the recent checks table.
     * @param {Array} data - Health check data.
     */
    updateTable: function(data) {
        const tbody = document.getElementById("healthTableBody");
        if (!tbody) return;

        const sorted = [...data].sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);

        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No health check data available</td></tr>';
            return;
        }

        tbody.innerHTML = sorted.map(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            const latency = entry.latency > 0 ? `${entry.latency} ms` : '<span class="text-muted">-</span>';
            const status = entry.status === "success" 
                ? '<span class="badge bg-success">Success</span>' 
                : `<span class="badge bg-danger" title="${entry.error || "Error"}">Error</span>`;
            
            return `
                <tr>
                    <td>${time}</td>
                    <td>${latency}</td>
                    <td>${status}</td>
                </tr>
            `;
        }).join("");
    },

    /**
     * Sets the active time range for data visualization.
     * @param {number} hours - Time range in hours.
     */
    setTimeRange: function(hours) {
        this.state.currentTimeRangeHours = hours;
        localStorage.setItem(this.state.TIME_RANGE_KEY, hours.toString());
        this.updateTimeRangeButtons(hours);
        this.renderAll();
    },

    /**
     * Filters health data based on the current time range selection.
     * @param {Array} data - List of health check entries.
     * @returns {Array} Filtered list.
     */
    filterDataByTimeRange: function(data) {
        const hours = this.state.currentTimeRangeHours;
        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        return data.filter(d => d.timestamp >= cutoff);
    }
};

// Initialize module when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/health') {
        HealthManager.init();
    }
});

    window.HealthManager = HealthManager;
})();
