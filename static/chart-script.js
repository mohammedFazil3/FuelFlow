document.addEventListener('DOMContentLoaded', function () {
  const salesData = JSON.parse(salesData); // Parse the salesData from the template

  const dates = salesData.map(data => data.date);
  const totalSales = salesData.map(data => data.totalSales);

  const ctx = document.getElementById('salesTrendChart').getContext('2d');

  const config = {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Total Sales',
          data: totalSales,
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1,
          fill: false,
          stepped: true, // Set the stepped option based on your preference
        }
      ]
    },
    options: {
      responsive: true,
      interaction: {
        intersect: false,
        axis: 'x'
      },
      plugins: {
        title: {
          display: true,
          text: (ctx) => 'Step ' + ctx.chart.data.datasets[0].stepped + ' Interpolation',
        }
      }
    }
  };

  // Merge the config with the default config from chart-script.js
  const mergedConfig = Object.assign({}, config, module.exports.config);

  const myChart = new Chart(ctx, mergedConfig);
});
