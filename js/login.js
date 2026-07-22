// Verifica si el usuario ya está logueado
function checkAuth() {
  const token = sessionStorage.getItem('vn_auth') || localStorage.getItem('vn_auth');
  if (token) {
    window.location.replace('inicio.html');
  }
}

// Inicializar Toast
const toastEl = document.getElementById('toast');
const toastIcon = document.getElementById('toast-icon');
const toastMsg = document.getElementById('toast-msg');
let toastTimeout;

function showToast(msg, type = 'info') {
  if (toastTimeout) clearTimeout(toastTimeout);
  
  toastMsg.textContent = msg;
  toastEl.className = 'toast visible';
  if (type === 'error') {
    toastEl.classList.add('error');
    toastIcon.className = 'fas fa-circle-exclamation';
    toastIcon.style.color = '#f87171';
  } else {
    toastIcon.className = 'fas fa-info-circle';
    toastIcon.style.color = '#60a5fa';
  }

  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 3000);
}

// Cargar Badges
async function loadBadges() {
  try {
    const [cornR, oilR, tiieR, wheatR] = await Promise.allSettled([
      VDS.commodityWithPct('CORN'),
      VDS.commodityWithPct('CRUDE_OIL'),
      VDS.banxico('SF61745'),
      VDS.commodityWithPct('WHEAT'),
    ]);
    const pick = r => r.status === 'fulfilled' && r.value != null ? r.value : null;
    const corn = pick(cornR), oil = pick(oilR), tiie = pick(tiieR), wheat = pick(wheatR);
    
    if (tiie) document.getElementById('badge-fin').textContent = `TIIE ${parseFloat(tiie).toFixed(2)}%`;
    if (corn) document.getElementById('badge-mkt').textContent = `Maíz $${corn.price.toFixed(2)}/bu`;
    if (oil) document.getElementById('badge-geo').textContent = `WTI $${oil.price.toFixed(1)}/bbl`;
    if (wheat) document.getElementById('badge-mx').textContent = `Trigo $${wheat.price.toFixed(2)}/bu`;
  } catch (e) {
    console.error('Error cargando badges:', e);
  }
}

function validEmail(e) { return /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(e); }

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadBadges();

  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submitBtn');
  const btnContent = document.getElementById('btnContent');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) { showToast('Ingresa tu correo empresarial', 'error'); return; }
    if (!validEmail(email)) { showToast('Formato de correo incorrecto', 'error'); return; }
    if (!password) { showToast('La contraseña no puede estar vacía', 'error'); return; }
    if (password.length < 4) { showToast('Contraseña demasiado corta', 'error'); return; }

    submitBtn.disabled = true;
    btnContent.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando…';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        showToast(data.error || 'Credenciales incorrectas', 'error');
        submitBtn.disabled = false;
        btnContent.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Iniciar sesión';
        return;
      }
      
      showToast('Bienvenido. Cargando plataforma…');
      sessionStorage.setItem('vn_auth', data.token);
      sessionStorage.setItem('vn_user', email);
      
      setTimeout(() => {
        window.location.replace('inicio.html');
      }, 500);
      
    } catch (err) {
      showToast('Error de conexión con el servidor', 'error');
      submitBtn.disabled = false;
      btnContent.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Iniciar sesión';
    }
  });

  const subscribeBtn = document.getElementById('subscribeBtn');
  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', () => {
      showToast('Próximamente: suscripción con alertas de mercado y análisis exclusivo.');
    });
  }
});
