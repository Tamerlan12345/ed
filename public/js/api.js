// --- Supabase Client ---
const SUPABASE_URL = 'https://wnsdlibhrlmgyszbyxat.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Induc2RsaWJocmxtZ3lzemJ5eGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyODE0MjgsImV4cCI6MjA2OTg1NzQyOH0.Sgz-50dHj8M599sIjTRYs0kMP7b6kX2BJ-Gc-trMUQ4';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Toast Notifications ---
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.warn('Toast container not found!');
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 5000);
}

// --- API State Management ---
const apiState = { activeCalls: 0 };

function showGlobalLoader() {
    let loader = document.getElementById('global-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.style.cssText = 'position:fixed; top:10px; left:50%; transform:translateX(-50%); background-color:#005A9C; color:white; padding:10px 20px; border-radius:8px; z-index:2000; font-weight:bold;';
        document.body.appendChild(loader);
    }
    loader.textContent = 'Загрузка...';
    loader.classList.remove('hidden');
}

function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.classList.add('hidden');
}

function updateApiState(change) {
    const wasActive = apiState.activeCalls > 0;
    apiState.activeCalls += change;
    const isActive = apiState.activeCalls > 0;
    if (!wasActive && isActive) showGlobalLoader();
    else if (wasActive && !isActive) hideGlobalLoader();
}

function handleApiError(errorData) {
    document.querySelectorAll('.inline-error').forEach(el => el.textContent = '');
    if (errorData.details && typeof errorData.details === 'object') {
        for (const fieldName in errorData.details) {
            const errorElement = document.getElementById(`${fieldName}-error`);
            if (errorElement) errorElement.textContent = errorData.details[fieldName];
            else showToast(`${fieldName}: ${errorData.details[fieldName]}`, 'error');
        }
        showToast(errorData.error || 'Пожалуйста, проверьте ошибки в форме.', 'error');
    } else if (errorData.error) {
        showToast(errorData.error, 'error');
    } else {
        showToast('Произошла неизвестная ошибка.', 'error');
    }
}

async function apiFetch(url, options = {}) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
        showToast('Ошибка: сессия не найдена. Пожалуйста, войдите снова.', 'error');
        throw new Error('Not authorized');
    }
    const token = session.access_token;

    updateApiState(1);

    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    if (config.body && typeof config.body !== 'string') {
        config.body = JSON.stringify(config.body);
    }

    try {
        const response = await fetch(url, config);
        if (!response.ok) {
            if (response.status === 403) {
                showToast('Доступ запрещен. У вас нет прав.', 'error');
                throw new Error('Forbidden');
            }
            let errorData;
            try { errorData = await response.json(); } catch (e) { errorData = { error: `Ошибка ${response.status}` }; }
            console.error('API Error Response:', errorData);
            if (response.status === 400) handleApiError(errorData);
            else showToast(errorData.error || `Ошибка ${response.status}.`, 'error');
            throw new Error(errorData.error || `API Call Failed`);
        }
        if (response.status === 204) {
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('API Call failed:', error);
        if (!error.message.includes('API Call Failed')) {
             showToast('Сетевая ошибка или сервер недоступен.', 'error');
        }
        throw error;
    } finally {
        updateApiState(-1);
    }
}

// Legacy function for old admin panel actions that have not been refactored yet.
async function apiCall(action, payload = {}) {
    return apiFetch('/api/admin', {
        method: 'POST',
        body: { action, ...payload }
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/'/g, '&apos;').replace(/"/g, '&quot;');
}