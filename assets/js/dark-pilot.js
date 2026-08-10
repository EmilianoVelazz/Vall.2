(function () {
    function applyDarkChartDefaults() {
        if (!document.body || !document.body.classList.contains('vn-dark-finanzas') || !window.Chart) return;
        Chart.defaults.color = '#9fb0bf';
        Chart.defaults.borderColor = 'rgba(143,165,183,.14)';
        if (Chart.defaults.plugins?.legend?.labels) Chart.defaults.plugins.legend.labels.color = '#b8c6d1';
        if (Chart.defaults.plugins?.tooltip) {
            Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(8,13,20,.94)';
            Chart.defaults.plugins.tooltip.titleColor = '#f1f5f8';
            Chart.defaults.plugins.tooltip.bodyColor = '#c5d1db';
            Chart.defaults.plugins.tooltip.borderColor = 'rgba(143,165,183,.24)';
            Chart.defaults.plugins.tooltip.borderWidth = 1;
        }
    }
    applyDarkChartDefaults();
    document.addEventListener('DOMContentLoaded', applyDarkChartDefaults, { once: true });
    window.VNDarkPilot = { apply: applyDarkChartDefaults };
})();
