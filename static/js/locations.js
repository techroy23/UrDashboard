/**
 * Provider Locations Module
 * Manages the fetching, caching, and visualization of provider geographic distribution.
 */
const D3Locations = (function() {
    'use strict';

    /**
     * Internal state management
     */
    const state = {
        locations: [],
        currentSort: { column: 'provider_count', direction: 'desc' },
        polling: {
            enabled: false,
            duration: 15 * 60 * 1000, // 15 minutes
            timeoutId: null,
            nextUpdate: null
        }
    };

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[LocationJS]', ...args);
        }
    }

    /**
     * Initializes the module, checks authentication, and starts data fetching.
     */
    async function init() {
        const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
        if (!jwt) {
            window.location.href = "/";
            return;
        }

        log('Initializing Provider Locations module...');
        
        // Setup unload handler to stop polling
        window.addEventListener('beforeunload', () => {
            stopPolling();
        });
        
        await fetchData(true); // Attempt to load from cache first
        startPolling();
    }

    /**
     * Fetches location data from the API or local cache.
     * @param {boolean} useCache - Whether to attempt reading from cache.
     */
    async function fetchData(useCache = false) {
        try {
            let success = false;

            // Attempt to retrieve from cache
            if (useCache) {
                const cachedData = localStorage.getItem('cache_locations_data');
                const cachedExpiry = localStorage.getItem('cache_locations_expiry');

                if (cachedData && cachedExpiry && Date.now() < parseInt(cachedExpiry)) {
                    const parsedData = JSON.parse(cachedData);
                    
                    // Validate if cache has the new format (check for prev_count in deltas)
                    const isValidFormat = parsedData.length === 0 || 
                                        (parsedData[0].delta_1h && parsedData[0].delta_1h.prev_count !== undefined);

                    if (isValidFormat) {
                        log('Using cached data:', parsedData.length, 'records');
                        state.locations = parsedData;
                        state.polling.nextUpdate = new Date(parseInt(cachedExpiry));
                        
                        renderPage();
                        scheduleNextPoll();
                        return;
                    } else {
                        log('Cached data format is obsolete. Clearing cache and fetching fresh data...');
                        localStorage.removeItem('cache_locations_data');
                        localStorage.removeItem('cache_locations_expiry');
                    }
                }
            }

            log('Fetching fresh data from APIs...');
            
            // Concurrent fetch for live and historical data
            const [liveRes, historyRes] = await Promise.allSettled([
                fetch('/api/locations'),
                fetch('/api/location-history')
            ]);

            let liveData = [];
            let historyData = {};

            if (liveRes.status === 'fulfilled' && liveRes.value.ok) {
                const data = await liveRes.value.json();
                liveData = data.locations || [];
                log('Fetched Live Data:', liveData.length, 'records');
            } else {
                console.error('[LocationJS] Live data fetch failed');
            }

            if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
                const data = await historyRes.value.json();
                historyData = data.history || {};
                log('Fetched History Data:', Object.keys(historyData).length, 'records');
            } else {
                console.warn('[LocationJS] History fetch failed, using live data only');
            }

            // Create a map of live data for easy lookup
            const liveMap = new Map(liveData.map(loc => [loc.name, loc]));

            // Merge Logic:
            // 1. Start with all keys from historyData (contains all tracked countries)
            // 2. Add any keys from liveData that might be new
            const allCountries = new Set([...Object.keys(historyData), ...liveMap.keys()]);
            
            state.locations = Array.from(allCountries).map(countryName => {
                const live = liveMap.get(countryName);
                const history = historyData[countryName];

                // If live data exists, use it as base.
                // If not, use history data (which now contains snapshot of last known state including 0 counts).
                // If neither (shouldn't happen given the Set), fallback to empty default.
                
                const base = live || history || { name: countryName, provider_count: 0 };

                // Ensure we have the deltas (prefer history's deltas)
                const deltas = history ? {
                    delta_1h: history.delta_1h,
                    delta_3h: history.delta_3h,
                    delta_6h: history.delta_6h,
                    delta_12h: history.delta_12h,
                    delta_24h: history.delta_24h
                } : {
                    delta_1h: { count: null, percent: null, direction: null, prev_count: null },
                    delta_3h: { count: null, percent: null, direction: null, prev_count: null },
                    delta_6h: { count: null, percent: null, direction: null, prev_count: null },
                    delta_12h: { count: null, percent: null, direction: null, prev_count: null },
                    delta_24h: { count: null, percent: null, direction: null, prev_count: null }
                };

                return {
                    ...base,
                    ...deltas
                };
            });
            
            // Persist merged data to cache
            const expiry = Date.now() + state.polling.duration;
            localStorage.setItem('cache_locations_data', JSON.stringify(state.locations));
            localStorage.setItem('cache_locations_expiry', expiry);
            
            state.polling.nextUpdate = new Date(expiry);
            success = true;
            
            renderPage();
            
            if (!success && !useCache) {
                state.polling.nextUpdate = new Date(Date.now() + state.polling.duration);
            }
            
            scheduleNextPoll();

        } catch (error) {
            console.error('[LocationJS] Fetch error:', error);
            if (window.App && window.App.utils) {
                App.utils.showToast('Failed to load location data', 'error');
            }
            
            // Ensure polling continuity on failure
            state.polling.nextUpdate = new Date(Date.now() + state.polling.duration);
            scheduleNextPoll();
        }
    }

    /**
     * Schedules the next data refresh.
     */
    function scheduleNextPoll() {
        if (!state.polling.enabled) return;

        if (state.polling.timeoutId) {
            clearTimeout(state.polling.timeoutId);
            state.polling.timeoutId = null;
        }

        if (!state.polling.nextUpdate) {
            state.polling.nextUpdate = new Date(Date.now() + state.polling.duration);
        }

        let delay = state.polling.nextUpdate.getTime() - Date.now();
        if (delay < 0) delay = 0;

        log(`Next refresh scheduled for ${state.polling.nextUpdate.toLocaleTimeString()} (in ${Math.round(delay/1000)}s)`);

        state.polling.timeoutId = setTimeout(() => {
            fetchData(false);
        }, delay);
    }

    /**
     * Enables periodic data polling.
     */
    function startPolling() {
        if (state.polling.enabled) return;
        state.polling.enabled = true;
        scheduleNextPoll();
    }

    /**
     * Disables periodic data polling.
     */
    function stopPolling() {
        state.polling.enabled = false;
        if (state.polling.timeoutId) {
            clearTimeout(state.polling.timeoutId);
            state.polling.timeoutId = null;
        }
    }

    /**
     * Formats a delta value into a badge with trend indicators and previous count.
     * @param {Object} delta - The delta object containing count, direction, and prev_count.
     * @returns {string} HTML string representing the delta cell.
     */
    function formatDeltaCell(delta) {
        if (!delta || delta.count === null || delta.prev_count === null) {
            return '<div class="text-muted">--</div>';
        }
        
        const { count, percent, direction, prev_count } = delta;
        let badgeClass, textClass, arrow;
        
        if (direction === 'up') {
            badgeClass = 'bg-success';
            textClass = 'text-success';
            arrow = '↑';
        } else if (direction === 'down') {
            badgeClass = 'bg-danger';
            textClass = 'text-danger';
            arrow = '↓';
        } else {
            badgeClass = 'bg-secondary';
            textClass = 'text-muted';
            arrow = '→';
        }
        
        const sign = count > 0 ? '+' : '';
        
        return `
            <div class="fw-bold mb-1">${prev_count}</div>
            <div style="font-size: 0.85em;">
                <span class="${textClass} me-1">${arrow}</span>
                <span class="badge ${badgeClass}">${sign}${count}</span>
                <span class="text-muted ms-1">(${sign}${percent}%)</span>
            </div>
        `;
    }

    /**
     * Triggers re-rendering of the entire page content.
     */
    function renderPage() {
        renderTable();
        renderBubbleChart();
    }

    /**
     * Renders the location tables (Overview and Trends).
     */
    function renderTable() {
        const overviewTbody = document.getElementById('overviewTableBody');
        const trendsTbody = document.getElementById('trendsTableBody');
        
        if (!overviewTbody || !trendsTbody) return;

        if (!state.locations || state.locations.length === 0) {
            const emptyRow = '<tr><td colspan="6" class="text-center text-muted">No location data available</td></tr>';
            overviewTbody.innerHTML = emptyRow;
            trendsTbody.innerHTML = emptyRow;
            return;
        }

        // Sort locations based on current configuration
        const sorted = [...state.locations].sort((a, b) => {
            const col = state.currentSort.column;
            const dir = state.currentSort.direction === 'asc' ? 1 : -1;

            let aVal = a[col];
            let bVal = b[col];

            if (col.startsWith('delta_')) {
                aVal = aVal?.count ?? -Infinity;
                bVal = bVal?.count ?? -Infinity;
            }

            if (col === 'name') {
                return dir * aVal.localeCompare(bVal);
            }

            return dir * (aVal - bVal);
        });

        // Render Overview Table
        overviewTbody.innerHTML = sorted.map(location => `
            <tr>
                <td>
                    ${location.country_code ? 
                        `<img src="https://flagcdn.com/24x18/${location.country_code.toLowerCase()}.png" 
                               alt="${location.country_code}" 
                               class="me-2"
                               style="border-radius: 2px;">` : ''}
                    <strong>${location.name}</strong>
                </td>
                <td><span class="badge bg-primary">${location.provider_count}</span></td>
                <td>${location.stable ? "✅" : "❌"}</td>
                <td>${location.strong_privacy ? "✅" : "❌"}</td>
            </tr>
        `).join('');

        // Render Trends Table
        trendsTbody.innerHTML = sorted.map(location => `
            <tr>
                <td>
                    ${location.country_code ? 
                        `<img src="https://flagcdn.com/24x18/${location.country_code.toLowerCase()}.png" 
                               alt="${location.country_code}" 
                               class="me-2"
                               style="border-radius: 2px;">` : ''}
                    <strong>${location.name}</strong>
                </td>
                <td><span class="badge bg-primary">${location.provider_count}</span></td>
                <td>${formatDeltaCell(location.delta_1h)}</td>
                <td>${formatDeltaCell(location.delta_3h)}</td>
                <td>${formatDeltaCell(location.delta_6h)}</td>
                <td>${formatDeltaCell(location.delta_12h)}</td>
                <td>${formatDeltaCell(location.delta_24h)}</td>
            </tr>
        `).join('');

        updateSortIcons();
    }

    /**
     * Updates the visual sort indicators in table headers.
     */
    function updateSortIcons() {
        document.querySelectorAll('[id^="sort-icon-"]').forEach(icon => {
            icon.innerHTML = '';
        });

        const col = state.currentSort.column;
        const arrow = state.currentSort.direction === 'asc' ? '▲' : '▼';

        const icon1 = document.getElementById(`sort-icon-${col}`);
        if (icon1) icon1.innerHTML = arrow;

        let icon2Id = `sort-icon-${col}`;
        if (['name', 'provider_count'].includes(col)) {
            icon2Id += '-trends';
        }
        
        const icon2 = document.getElementById(icon2Id);
        if (icon2) icon2.innerHTML = arrow;
    }

    /**
     * Sorts the table by a specific column.
     * @param {string} column - The key to sort by.
     */
    function sortTable(column) {
        if (state.currentSort.column === column) {
            state.currentSort.direction = state.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            state.currentSort.column = column;
            state.currentSort.direction = column === 'name' ? 'asc' : 'desc';
        }
        renderTable();
    }

    /**
     * Renders a D3.js packed bubble chart for provider distribution.
     */
    function renderBubbleChart() {
        const container = document.getElementById('d3-bubble-chart');
        const loader = document.getElementById('bubble-chart-loader');
        const chartContainer = document.getElementById('bubble-chart-container');
        
        if (!container) return;

        const filteredLocations = state.locations.filter(loc => loc.provider_count > 1);

        if (filteredLocations.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-5">No locations with 2+ providers available</div>';
            if (loader) loader.style.display = 'none';
            if (chartContainer) chartContainer.style.display = 'block';
            return;
        }

        filteredLocations.sort((a, b) => b.provider_count - a.provider_count);

        if (loader) loader.style.display = 'none';
        if (chartContainer) chartContainer.style.display = 'block';

        d3.select(container).selectAll("*").remove();

        const width = container.offsetWidth;
        const height = 500;

        const svg = d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height]);

        const tooltip = d3.select("body").append("div")
            .attr("class", "chart-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", "rgba(0, 0, 0, 0.8)")
            .style("color", "white")
            .style("padding", "10px")
            .style("border-radius", "5px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "10000");

        const pack = d3.pack()
            .size([width - 20, height - 20])
            .padding(3);

        const root = d3.hierarchy({ children: filteredLocations })
            .sum(d => d.provider_count);

        const nodes = pack(root).leaves();

        const bubbles = svg.selectAll("g")
            .data(nodes)
            .join("g")
            .attr("transform", d => `translate(${d.x + 10},${d.y + 10})`);

        bubbles.append("circle")
            .attr("r", d => d.r)
            .attr("fill", d => {
                if (d.data.strong_privacy && d.data.stable) return "#28a745";
                if (d.data.strong_privacy || d.data.stable) return "#ffc107";
                return "#dc3545";
            })
            .attr("opacity", 0.7)
            .attr("stroke", d => {
                if (d.data.strong_privacy && d.data.stable) return "#1e7e34";
                if (d.data.strong_privacy || d.data.stable) return "#d39e00";
                return "#bd2130";
            })
            .attr("stroke-width", 2)
            .style("cursor", "pointer")
            .on("mouseover", function(event, d) {
                d3.select(this)
                    .transition().duration(200)
                    .attr("opacity", 1)
                    .attr("stroke-width", 3);
                
                tooltip.style("visibility", "visible")
                    .html(`
                        <strong>${d.data.name}</strong><br/>
                        Providers: ${d.data.provider_count}<br/>
                        Privacy: ${d.data.strong_privacy ? "Strong ✅" : "Weak ❌"}<br/>
                        Stability: ${d.data.stable ? "Stable ✅" : "Unstable ❌"}
                    `);
            })
            .on("mousemove", function(event) {
                tooltip.style("top", (event.pageY - 10) + "px")
                       .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function() {
                d3.select(this)
                    .transition().duration(200)
                    .attr("opacity", 0.7)
                    .attr("stroke-width", 2);
                tooltip.style("visibility", "hidden");
            });

        bubbles.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "0.3em")
            .attr("fill", "white")
            .attr("font-size", d => Math.min(d.r / 3, 14) + "px")
            .attr("font-weight", "bold")
            .style("pointer-events", "none")
            .text(d => d.r > 25 ? d.data.name : "");

        bubbles.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "1.5em")
            .attr("fill", "white")
            .attr("font-size", d => Math.min(d.r / 4, 12) + "px")
            .style("pointer-events", "none")
            .text(d => d.r > 30 ? `${d.data.provider_count}` : "");

        // Render Legend
        const legend = svg.append("g")
            .attr("transform", `translate(${width - 150}, 20)`);
            
        const legendData = [
            { label: "Privacy + Stable", color: "#28a745" },
            { label: "Moderate", color: "#ffc107" },
            { label: "Needs Improvement", color: "#dc3545" }
        ];

        legendData.forEach((item, i) => {
            const legendRow = legend.append("g")
                .attr("transform", `translate(0, ${i * 25})`);
            legendRow.append("circle").attr("r", 8).attr("fill", item.color).attr("opacity", 0.7);
            legendRow.append("text").attr("x", 15).attr("y", 4)
                .attr("fill", "rgba(108, 117, 125, 0.9)")
                .attr("font-size", "11px")
                .text(item.label);
        });
    }

    // Exposed Public API
    return {
        init,
        sortTable,
        fetchData
    };
})();

// Initialize on DOM content load
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname === '/locations') {
        D3Locations.init();
    }
});
