(function () {
    function applyDarkChartDefaults() {
        if (!document.body || !document.body.classList.contains('vn-dark-finanzas') || !window.Chart) return;
        Chart.defaults.color = '#a6b5c2';
        Chart.defaults.borderColor = 'rgba(155,173,188,.18)';
        if (Chart.defaults.plugins?.legend?.labels) Chart.defaults.plugins.legend.labels.color = '#bcc9d4';
        if (Chart.defaults.plugins?.tooltip) {
            Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(22,31,44,.94)';
            Chart.defaults.plugins.tooltip.titleColor = '#f1f5f8';
            Chart.defaults.plugins.tooltip.bodyColor = '#c8d3dd';
            Chart.defaults.plugins.tooltip.borderColor = 'rgba(155,173,188,.28)';
            Chart.defaults.plugins.tooltip.borderWidth = 1;
        }
    }
    applyDarkChartDefaults();
    document.addEventListener('DOMContentLoaded', applyDarkChartDefaults, { once: true });
    window.VNDarkPilot = { apply: applyDarkChartDefaults };
})();
