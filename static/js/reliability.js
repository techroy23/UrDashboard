(function() {
    'use strict';

    /**
     * Verbose logging helper
     */
    const VERBOSE_LOGGING = true;
    function log(...args) {
        if (VERBOSE_LOGGING) {
            console.log('[Reliability]', ...args);
        }
    }

/**
 * Network Reliability Module
 * Handles visualization of network reliability weights and client counts using D3.js.
 */
const D3Reliability = {
    /**
     * Internal state management
     */
    state: {
        globalData: null,
        aggregatedData: null,
        currentSort: { key: 'reliability_multiplier', dir: 'desc' },
        margin: { top: 20, right: 60, bottom: 65, left: 60 },
        colors: {
            weight: 'rgb(75, 192, 192)',
            clients: 'rgb(255, 99, 132)',
            total: 'rgb(54, 162, 235)'
        },
        polling: {
            enabled: false,
            duration: 30 * 60 * 1000, // 30 minutes
            timeoutId: null,
            lastUpdate: null,
            nextUpdate: null
        }
    },

    /**
     * Initializes the module, checks authentication, and starts data fetching.
     */
    init: async function() {
        const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
        if (!jwt) {
            window.location.href = "/";
            return;
        }

        console.log("[Reliability] Initializing Reliability Monitor...");
        
        this.setupEventListeners();
        this.setupPollingListeners();
        
        // Initial data fetch (uses cache if available)
        await this.fetchData(true);
        
        // Start background polling
        this.startPolling();
    },

    /**
     * Fetches reliability data from the server or cache.
     * @param {boolean} useCache - Whether to attempt reading from cache.
     * @returns {Promise<boolean>} Success status.
     */
    fetchData: async function(useCache = false) {
        const jwt = localStorage.getItem("by_jwt") || localStorage.getItem("jwt");
        if (!jwt) {
            this.stopPolling();
            window.location.href = "/";
            return false;
        }

        let success = false;

        // Check cache first
        if (useCache) {
            const cached = this.getCache('reliability');
            if (cached) {
                console.log('[Reliability] Using cached data');
                this.state.globalData = cached.data.reliability_window;
                this.state.aggregatedData = this.aggregateToHourly(this.state.globalData);
                this.state.polling.lastUpdate = new Date();
                
                const expiry = parseInt(localStorage.getItem('cache_reliability_expiry'));
                this.state.polling.nextUpdate = new Date(expiry);
                
                await this.renderPage();
                this.scheduleNextPoll();
                return true;
            }
        }

        // Fetch from network
        try {
            const result = await fetch('/api/reliability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: jwt })
            }).then(r => r.json());

            if (result.valid && result.data && result.data.reliability_window) {
                const expiry = this.setCache('reliability', result);
                this.state.globalData = result.data.reliability_window;
                this.state.aggregatedData = this.aggregateToHourly(this.state.globalData);
                this.state.polling.lastUpdate = new Date();
                this.state.polling.nextUpdate = new Date(expiry);
                
                await this.renderPage();
                console.log('[Reliability] Data refreshed at', this.state.polling.lastUpdate.toLocaleTimeString());
                success = true;
            } else {
                console.error('[Reliability] Invalid data received:', result);
                if (typeof ErrorManager !== 'undefined') {
                    ErrorManager.showToast(result.reason || 'Failed to load reliability data', 'danger');
                }
            }
        } catch (err) {
            console.error('[Reliability] Fetch failed:', err);
            if (typeof ErrorManager !== 'undefined') {
                ErrorManager.showToast('Network error during reliability fetch.', 'warning');
            }
        }

        if (!success && !useCache) {
            this.state.polling.nextUpdate = new Date(Date.now() + this.state.polling.duration);
        }

        this.scheduleNextPoll();
        return success;
    },

    /**
     * Configures event listeners for window and UI controls.
     */
    setupEventListeners: function() {
        ['showWeight', 'showClients', 'showTotal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.renderChart());
            }
        });

        window.addEventListener('resize', () => {
            if (this.state.aggregatedData) {
                this.renderChart();
            }
        });
    },

    /**
     * Sets up listeners for polling management.
     */
    setupPollingListeners: function() {
        window.addEventListener('beforeunload', () => this.stopPolling());
    },

    /**
     * Starts the polling process.
     */
    startPolling: function() {
        if (this.state.polling.enabled) return;
        this.state.polling.enabled = true;
        this.scheduleNextPoll();
    },

    /**
     * Schedules the next data poll.
     */
    scheduleNextPoll: function() {
        if (!this.state.polling.enabled) return;
        
        if (this.state.polling.timeoutId) {
            clearTimeout(this.state.polling.timeoutId);
            this.state.polling.timeoutId = null;
        }

        if (!this.state.polling.nextUpdate) {
            this.state.polling.nextUpdate = new Date(Date.now() + this.state.polling.duration);
        }

        let delay = this.state.polling.nextUpdate.getTime() - Date.now();
        if (delay < 0) delay = 0;

        console.log('[Reliability] Next refresh scheduled for', this.state.polling.nextUpdate.toLocaleTimeString());

        this.state.polling.timeoutId = setTimeout(async () => {
            await this.fetchData(false);
        }, delay);
    },

    /**
     * Stops the polling process.
     */
    stopPolling: function() {
        this.state.polling.enabled = false;
        if (this.state.polling.timeoutId) {
            clearTimeout(this.state.polling.timeoutId);
            this.state.polling.timeoutId = null;
        }
        this.state.polling.nextUpdate = null;
    },

    /**
     * Retrieves data from the local cache.
     * @param {string} key - Cache key.
     * @returns {Object|null} Cached data or null.
     */
    getCache: function(key) {
        try {
            const expiry = localStorage.getItem(`cache_${key}_expiry`);
            const data = localStorage.getItem(`cache_${key}_data`);
            
            if (data && expiry && Date.now() < parseInt(expiry)) {
                return JSON.parse(data);
            }
        } catch (e) {}
        return null;
    },

    /**
     * Saves data to the local cache.
     * @param {string} key - Cache key.
     * @param {Object} data - Data to store.
     * @returns {number} Expiry timestamp.
     */
    setCache: function(key, data) {
        try {
            const expiry = Date.now() + this.state.polling.duration;
            localStorage.setItem(`cache_${key}_data`, JSON.stringify(data));
            localStorage.setItem(`cache_${key}_expiry`, expiry);
            return expiry;
        } catch (e) {
            return Date.now() + this.state.polling.duration;
        }
    },

    /**
     * Aggregates raw data points into hourly averages.
     * @param {Object} data - Raw reliability data.
     * @returns {Array} Aggregated hourly data.
     */
    aggregateToHourly: function(data) {
        const bucketSecs = data.bucket_duration_seconds;
        const bucketsPerHour = 3600 / bucketSecs;
        const rawWeights = data.reliability_weights;
        const rawClients = data.client_counts;
        const rawTotalClients = data.total_client_counts;
        const startTime = data.min_time_unix_milli;

        const result = [];
        
        for (let i = 0; i < rawWeights.length; i += bucketsPerHour) {
            const chunkWeights = rawWeights.slice(i, i + bucketsPerHour);
            const chunkClients = rawClients.slice(i, i + bucketsPerHour);
            const chunkTotalClients = rawTotalClients.slice(i, i + bucketsPerHour);
            
            if (chunkWeights.length === 0) break;
            
            const avgWeight = chunkWeights.reduce((a, b) => a + b, 0) / chunkWeights.length;
            const avgClient = chunkClients.reduce((a, b) => a + b, 0) / chunkClients.length;
            const avgTotalClient = chunkTotalClients.reduce((a, b) => a + b, 0) / chunkTotalClients.length;
            
            const time = new Date(startTime + i * bucketSecs * 1000);
            const dateLabel = time.toLocaleDateString([], { month: 'short', day: '2-digit' }).replace(' ', '/');
            const timeLabel = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
            
            result.push({
                time, dateLabel, timeLabel,
                weight: avgWeight,
                clients: avgClient,
                totalClients: avgTotalClient,
                index: result.length
            });
        }
        
        return result;
    },

    /**
     * Triggers re-rendering of all module components.
     */
    renderPage: async function() {
        this.renderChart();
        this.renderSummary();
        await this.renderCountryTable();
    },

    /**
     * Renders the summary statistics cards.
     */
    renderSummary: function() {
        const data = this.state.globalData;
        if (!data) return;

        const avgWeight = data.mean_reliability_weight.toFixed(2);
        const summaryDiv = document.getElementById('stats-summary');
        
        if (summaryDiv) {
            summaryDiv.innerHTML = `
                <div class="col-md-4">
                    <div class="card glass-card mb-3">
                        <div class="card-body text-center">
                            <h6>Mean Reliability Weight</h6>
                            <h3>${avgWeight}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card glass-card mb-3">
                        <div class="card-body text-center">
                            <h6>Max Clients</h6>
                            <h3>${data.max_client_count}</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card glass-card mb-3">
                        <div class="card-body text-center">
                            <h6>Max Total Clients</h6>
                            <h3>${data.max_total_client_count}</h3>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    /**
     * Renders the main reliability chart.
     */
    renderChart: function() {
        const loader = document.getElementById('chart-loader');
        const container = document.getElementById('chart-container');
        
        if (loader) loader.style.display = 'none';
        if (container) container.style.display = 'block';

        if (typeof d3 === 'undefined') return;

        d3.select('#d3-chart').selectAll('*').remove();
        this.renderLineChart();
    },

    /**
     * Calculates chart dimensions based on the container size.
     * @returns {Object} Dimensions object.
     */
    getChartDimensions: function() {
        const container = document.getElementById('chart-container');
        const width = container ? container.clientWidth : 800;
        const height = 400;
        return {
            width: width - this.state.margin.left - this.state.margin.right,
            height: height - this.state.margin.top - this.state.margin.bottom,
            fullWidth: width,
            fullHeight: height
        };
    },

    /**
     * Determines which data series are currently visible based on toggles.
     * @returns {Object} visibility states.
     */
    getVisibleSeries: function() {
        const w = document.getElementById('showWeight');
        const c = document.getElementById('showClients');
        const t = document.getElementById('showTotal');
        return {
            weight: w ? w.checked : true,
            clients: c ? c.checked : true,
            total: t ? t.checked : true
        };
    },

    /**
     * Internal method to draw the line chart using D3.js.
     */
    renderLineChart: function() {
        const data = this.state.aggregatedData;
        const { width, height, fullWidth, fullHeight } = this.getChartDimensions();
        const { margin, colors } = this.state;
        const visible = this.getVisibleSeries();

        const svg = d3.select('#d3-chart')
            .attr('width', fullWidth)
            .attr('height', fullHeight);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Configure Scales
        const x = d3.scaleLinear()
            .domain([0, data.length - 1])
            .range([0, width]);

        const yWeight = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.weight) * 1.1])
            .range([height, 0]);

        const yClients = d3.scaleLinear()
            .domain([0, d3.max(data, d => Math.max(d.clients, d.totalClients)) * 1.1])
            .range([height, 0]);

        // Draw Grid Lines
        g.append('g')
            .attr('class', 'grid')
            .attr('opacity', 0.1)
            .call(d3.axisLeft(yWeight).tickSize(-width).tickFormat(''));

        // Draw X Axis
        const tickIndices = d3.range(0, data.length, Math.ceil(data.length / 10));
        const xAxis = g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).tickValues(tickIndices).tickFormat(() => ''));
        
        xAxis.selectAll('.tick').each(function(i) {
            const tick = d3.select(this);
            const d = data[i];
            if (d) {
                tick.append('text').attr('y', 12).attr('text-anchor', 'middle')
                    .style('fill', 'rgba(108, 117, 125, 0.8)').style('font-size', '10px').text(d.dateLabel);
                tick.append('text').attr('y', 24).attr('text-anchor', 'middle')
                    .style('fill', 'rgba(108, 117, 125, 0.6)').style('font-size', '9px').text(d.timeLabel);
            }
        });

        // Draw Axes Labels
        g.append('g').call(d3.axisLeft(yWeight)).selectAll('text').style('fill', 'rgba(108, 117, 125, 0.8)');
        g.append('text').attr('transform', 'rotate(-90)').attr('y', -45).attr('x', -height / 2)
            .attr('text-anchor', 'middle').style('fill', 'rgba(108, 117, 125, 0.8)').style('font-size', '12px').text('Weight');

        g.append('g').attr('transform', `translate(${width},0)`).call(d3.axisRight(yClients))
            .selectAll('text').style('fill', 'rgba(108, 117, 125, 0.8)');
        g.append('text').attr('transform', 'rotate(90)').attr('y', -width - 45).attr('x', height / 2)
            .attr('text-anchor', 'middle').style('fill', 'rgba(108, 117, 125, 0.8)').style('font-size', '12px').text('Clients');

        // Configure Lines
        const lineWeight = d3.line().x((d, i) => x(i)).y(d => yWeight(d.weight)).curve(d3.curveMonotoneX);
        const lineClients = d3.line().x((d, i) => x(i)).y(d => yClients(d.clients)).curve(d3.curveMonotoneX);
        const lineTotal = d3.line().x((d, i) => x(i)).y(d => yClients(d.totalClients)).curve(d3.curveMonotoneX);

        if (visible.weight) g.append('path').datum(data).attr('fill', 'none').attr('stroke', colors.weight).attr('stroke-width', 2).attr('d', lineWeight);
        if (visible.clients) g.append('path').datum(data).attr('fill', 'none').attr('stroke', colors.clients).attr('stroke-width', 2).attr('d', lineClients);
        if (visible.total) g.append('path').datum(data).attr('fill', 'none').attr('stroke', colors.total).attr('stroke-width', 2).attr('d', lineTotal);

        this.addTooltip(svg, g, data, x, yWeight, yClients, width, height, visible);
    },

    /**
     * Adds an interactive tooltip to the chart.
     */
    addTooltip: function(svg, g, data, x, yWeight, yClients, width, height, visible) {
        const tooltip = d3.select('body').append('div')
            .attr('class', 'd3-tooltip')
            .style('position', 'absolute').style('background', 'rgba(0,0,0,0.85)')
            .style('color', 'white').style('padding', '10px 14px').style('border-radius', '6px')
            .style('font-size', '12px').style('pointer-events', 'none').style('opacity', 0)
            .style('z-index', 1000).style('box-shadow', '0 2px 8px rgba(0,0,0,0.3)');

        const focusLine = g.append('line').attr('class', 'focus-line')
            .attr('y1', 0).attr('y2', height).attr('stroke', 'rgba(108, 117, 125, 0.5)')
            .attr('stroke-dasharray', '3,3').style('opacity', 0);

        const focusCircles = g.append('g').attr('class', 'focus-circles');
        if (visible.weight) focusCircles.append('circle').attr('class', 'focus-weight').attr('r', 5).attr('fill', this.state.colors.weight).style('opacity', 0);
        if (visible.clients) focusCircles.append('circle').attr('class', 'focus-clients').attr('r', 5).attr('fill', this.state.colors.clients).style('opacity', 0);
        if (visible.total) focusCircles.append('circle').attr('class', 'focus-total').attr('r', 5).attr('fill', this.state.colors.total).style('opacity', 0);

        const { colors, margin } = this.state;

        svg.append('rect')
            .attr('class', 'overlay').attr('width', width).attr('height', height)
            .attr('transform', `translate(${margin.left},${margin.top})`)
            .attr('fill', 'none').attr('pointer-events', 'all')
            .on('mousemove', function(event) {
                const [mx] = d3.pointer(event);
                const i = Math.round(x.invert(mx));
                
                if (i >= 0 && i < data.length) {
                    const d = data[i];
                    focusLine.attr('x1', x(i)).attr('x2', x(i)).style('opacity', 1);

                    if (visible.weight) focusCircles.select('.focus-weight').attr('cx', x(i)).attr('cy', yWeight(d.weight)).style('opacity', 1);
                    if (visible.clients) focusCircles.select('.focus-clients').attr('cx', x(i)).attr('cy', yClients(d.clients)).style('opacity', 1);
                    if (visible.total) focusCircles.select('.focus-total').attr('cx', x(i)).attr('cy', yClients(d.totalClients)).style('opacity', 1);

                    let html = `<strong>${d.dateLabel} ${d.timeLabel}</strong><br/>`;
                    if (visible.weight) html += `<span style="color:${colors.weight}">Weight: ${d.weight.toFixed(2)}</span><br/>`;
                    if (visible.clients) html += `<span style="color:${colors.clients}">Clients: ${d.clients.toFixed(0)}</span><br/>`;
                    if (visible.total) html += `<span style="color:${colors.total}">Total: ${d.totalClients.toFixed(0)}</span>`;

                    tooltip.html(html).style('left', (event.pageX + 15) + 'px').style('top', (event.pageY - 10) + 'px').style('opacity', 1);
                }
            })
            .on('mouseout', function() {
                focusLine.style('opacity', 0);
                focusCircles.selectAll('circle').style('opacity', 0);
                tooltip.style('opacity', 0);
            });
    },

    /**
     * Handles sorting of the country multipliers table.
     * @param {string} key - Column key to sort by.
     */
    sortCountries: function(key) {
        const sort = this.state.currentSort;
        if (sort.key === key) {
            sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            sort.key = key;
            sort.dir = 'desc';
        }
        
        document.querySelectorAll('#countryTable th span').forEach(el => el.innerHTML = '');
        const icon = sort.dir === 'asc' ? '&#9650;' : '&#9660;';
        const iconEl = document.getElementById(`sort-icon-${key}`);
        if (iconEl) iconEl.innerHTML = icon;
        
        this.renderCountryTable();
    },

    /**
     * Renders the country multipliers table.
     */
    renderCountryTable: async function() {
        const tbody = document.getElementById('countryTableBody');
        if (!tbody || !this.state.globalData) return;
        
        let countries = [...this.state.globalData.country_multipliers];
        const { key: sortKey, dir: sortDir } = this.state.currentSort;
        
        countries.sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];
            if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        
        tbody.innerHTML = countries.map(c => `
            <tr>
                <td>
                    <img src="https://flagcdn.com/24x18/${c.country_code.toLowerCase()}.png" 
                         alt="${c.country_code}" class="me-2" style="border-radius: 2px;">
                    ${c.country}
                </td>
                <td>${c.reliability_multiplier.toFixed(2)}x</td>
            </tr>
        `).join('');
    }
};

// Initialization on DOM load
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname === '/reliability') {
        D3Reliability.init();
    }
});

// App-wide initialization compatibility
if (typeof App !== 'undefined' && App.base) {
    const originalInit = App.base.init;
    App.base.init = function() {
        originalInit.apply(this, arguments);
        if (window.location.pathname === '/reliability') {
            D3Reliability.init();
        }
    };
}

// Export
window.D3Reliability = D3Reliability;

})();
