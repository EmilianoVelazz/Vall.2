(function () {
  if (!window.Chart) return;

  Chart.defaults.color = '#5b6b7f';
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.borderColor = 'rgba(148, 163, 184, .22)';
  Chart.defaults.animation.duration = 650;
  Chart.defaults.animation.easing = 'easeOutQuart';
  Chart.defaults.interaction.mode = 'index';
  Chart.defaults.interaction.intersect = false;
  Chart.defaults.elements.line.borderWidth = 2.5;
  Chart.defaults.elements.line.tension = .34;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hoverRadius = 5;
  Chart.defaults.elements.point.hitRadius = 12;
  Chart.defaults.elements.bar.borderRadius = 7;
  Chart.defaults.elements.bar.borderSkipped = false;
  Chart.defaults.scale.beginAtZero = false;
  Chart.defaults.scale.grid.color = 'rgba(148, 163, 184, .16)';
  Chart.defaults.scale.grid.drawBorder = false;
  Chart.defaults.scale.ticks.color = '#64748b';
  Chart.defaults.scale.ticks.padding = 8;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
  Chart.defaults.plugins.legend.labels.padding = 18;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(8, 21, 37, .96)';
  Chart.defaults.plugins.tooltip.titleColor = '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = '#dbeafe';
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.tooltip.caretPadding = 8;
  Chart.defaults.plugins.tooltip.boxPadding = 5;

  function syncExecutiveStrip() {
    var pairs = [
      ['hub-sp500', 'exec-sp500'],
      ['hub-hdr-us10y', 'exec-us10y'],
      ['hub-usdmxn', 'exec-usdmxn'],
      ['hub-commodity-wti', 'exec-wti'],
    ];
    pairs.forEach(function (pair) {
      var source = document.getElementById(pair[0]);
      var target = document.getElementById(pair[1]);
      if (!source || !target) return;
      var copy = function () { target.textContent = source.textContent || '—'; };
      copy();
      new MutationObserver(copy).observe(source, { childList: true, characterData: true, subtree: true });
    });

    var commodityPairs = [
      ['p-wti', 'hub-commodity-wti'],
      ['p-wti', 'hub-hdr-energy'],
      ['p-brent', 'hub-commodity-brent'],
      ['p-gas', 'hub-commodity-gas'],
    ];
    commodityPairs.forEach(function (pair) {
      var source = document.getElementById(pair[0]);
      var target = document.getElementById(pair[1]);
      if (!source || !target) return;
      var copy = function () { target.textContent = source.textContent || '—'; };
      copy();
      new MutationObserver(copy).observe(source, { childList: true, characterData: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncExecutiveStrip);
  } else {
    syncExecutiveStrip();
  }
})();
