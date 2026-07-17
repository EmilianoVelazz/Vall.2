/* ══════════════════════════════════════════════
   REPORTS GENERATOR - VALLNEWS
══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const userEmailInput = document.getElementById('userEmail');
    const reportTypeSelect = document.getElementById('reportType');
    const generateReportBtn = document.getElementById('generateReportBtn');
    const reportStatus = document.getElementById('reportStatus');
    const reportsList = document.getElementById('mailboxList');

    // Cargar email guardado
    const savedEmail = localStorage.getItem('vallnews_user_email');
    if (savedEmail) {
        userEmailInput.value = savedEmail;
    }

    // Evento para generar reporte
    generateReportBtn.addEventListener('click', async () => {
        const userEmail = userEmailInput.value.trim();
        const reportType = reportTypeSelect.value;

        // Validar email
        if (!userEmail || !userEmail.includes('@')) {
            showStatus('Por favor ingresa un email válido', 'error');
            return;
        }

        // Guardar email
        localStorage.setItem('vallnews_user_email', userEmail);

        // Mostrar estado de carga
        showStatus('Generando reporte con Gemini Pro... Esto puede tardar unos segundos.', 'loading');
        generateReportBtn.disabled = true;

        try {
            const response = await fetch('/api/reports/generate', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userEmail,
                    reportType,
                    dataPoints: {}
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error generando reporte');
            }

            // Mostrar éxito
            showStatus(`✅ ¡Reporte generado! Se envió a ${userEmail}`, 'success');

            // Agregar a la lista de reportes
            addReportToList(reportType, userEmail);

            // Limpiar input
            userEmailInput.value = '';

            // Auto-ocultar después de 3 segundos
            setTimeout(() => {
                reportStatus.style.display = 'none';
            }, 3000);

        } catch (error) {
            console.error('Error:', error);
            showStatus(`❌ Error: ${error.message}`, 'error');
        } finally {
            generateReportBtn.disabled = false;
        }
    });

    function showStatus(message, type) {
        reportStatus.innerHTML = type === 'loading' 
            ? `<span class="spinner"></span><span>${message}</span>`
            : message;
        reportStatus.className = `rg-status ${type}`;
        reportStatus.style.display = 'flex';
        reportStatus.style.alignItems = 'center';
    }

    function addReportToList(reportType, email) {
        const reportNames = {
            market: '📈 Análisis de Mercados',
            geopolitical: '🌍 Análisis Geopolítico',
            mexico: '🇲🇽 Perspectiva México'
        };

        const html = `
            <div class="mb-msg" style="border-left: 3px solid #22c55e;">
                <div class="mb-msg-icon"><i class="fas fa-file-word" style="color: #2563eb;"></i></div>
                <div class="mb-msg-content">
                    <h4>${reportNames[reportType] || reportType}</h4>
                    <p>Enviado a: ${email}</p>
                    <span class="mb-date">Justo ahora</span>
                </div>
            </div>
        `;

        reportsList.insertAdjacentHTML('afterbegin', html);

        // Guardar en localStorage
        const savedReports = JSON.parse(localStorage.getItem('vallnews_reports') || '[]');
        savedReports.unshift({
            type: reportType,
            email,
            date: new Date().toISOString()
        });
        // Guardar últimos 10 reportes
        localStorage.setItem('vallnews_reports', JSON.stringify(savedReports.slice(0, 10)));
    }

    // Cargar reportes guardados
    const savedReports = JSON.parse(localStorage.getItem('vallnews_reports') || '[]');
    if (reportsList && savedReports.length > 0) {
        savedReports.forEach(report => {
            const reportNames = {
                market: '📈 Análisis de Mercados',
                geopolitical: '🌍 Análisis Geopolítico',
                mexico: '🇲🇽 Perspectiva México'
            };

            const date = new Date(report.date);
            const timeAgo = getTimeAgo(date);

            const html = `
                <div class="mb-msg">
                    <div class="mb-msg-icon"><i class="fas fa-file-word" style="color: #2563eb;"></i></div>
                    <div class="mb-msg-content">
                        <h4>${reportNames[report.type] || report.type}</h4>
                        <p>Enviado a: ${report.email}</p>
                        <span class="mb-date">${timeAgo}</span>
                    </div>
                </div>
            `;

            reportsList.insertAdjacentHTML('beforeend', html);
        });
    }

    function getTimeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Hace unos segundos';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `Hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
        const days = Math.floor(hours / 24);
        return `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
    }
});
