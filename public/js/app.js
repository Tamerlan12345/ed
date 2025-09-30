document.addEventListener('DOMContentLoaded', () => {
    const userData = { email: '', token: null, role: null };
    let courses = [];
    let currentCourse = null;
    let userProgress = {};
    let simulationHistory = [];
    let backButtonAction = null;
    let timeTrackingInterval = null;
    let secondsSinceLastUpdate = 0;

    // --- DOM Elements ---
    const authView = document.getElementById('auth-view');
    const appView = document.getElementById('app-view');
    const adminView = document.getElementById('panel-view');
    const authForm = document.getElementById('auth-form');
    const authError = document.getElementById('auth-error');
    const contentArea = document.getElementById('content-area');
    const mainMenu = document.getElementById('main-menu');
    const productContent = document.getElementById('product-content');
    const testView = document.getElementById('test-view');
    const testResultsView = document.getElementById('test-results');
    const windowTitle = document.getElementById('window-title');
    const backToMenuBtn = document.getElementById('back-to-menu-btn');
    const backToMenuFromResultsBtn = document.getElementById('back-to-menu-from-results');
    const logoutBtn = document.getElementById('logout-btn');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    const simulatorView = document.getElementById('simulator-view');
    const launchSimulatorBtn = document.getElementById('launch-simulator-btn');
    const extraToolsDiv = document.getElementById('extra-tools');
    const contentLoader = document.getElementById('content-loader');

    function stopTimeTracking() {
        if (timeTrackingInterval) {
            clearInterval(timeTrackingInterval);
            timeTrackingInterval = null;
        }
    }

    async function sendTimeUpdate(courseId, seconds) {
        try {
            await apiFetch('/api/update-time-spent', {
                method: 'POST',
                body: { course_id: courseId, time_spent_seconds: seconds }
            });
        } catch (error) {
            console.error('Failed to update time spent:', error);
        }
    }

    function showLoader() {
        if(contentArea) contentArea.classList.add('hidden');
        if(contentLoader) contentLoader.classList.remove('hidden');
    }

    function hideLoader() {
        if(contentArea) contentArea.classList.remove('hidden');
        if(contentLoader) contentLoader.classList.add('hidden');
    }

    function showMessage(message, details = '') {
        if (!contentArea) return;
        contentArea.innerHTML = '';
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.textContent = message;

        if (details) {
            const br = document.createElement('br');
            const small = document.createElement('small');
            small.style.color = '#999';
            small.textContent = details;
            messageDiv.appendChild(br);
            messageDiv.appendChild(small);
        }
        contentArea.appendChild(messageDiv);
        hideLoader();
    }

    async function handleLogin(email, password) {
        const authButton = document.getElementById('auth-button');
        authButton.disabled = true;
        authButton.textContent = 'Вход...';
        if(authError) authError.classList.add('hidden');

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (data && data.session) await onLoginSuccess(data.session);
            else throw new Error("Ответ от сервера не содержит сессию.");
        } catch (error) {
            console.error("Не удалось войти:", error);
            let errorMessage = 'Не удалось войти. Проверьте подключение к сети.';
            if (error.message.includes('Invalid login credentials')) errorMessage = 'Неверный логин или пароль.';
            showToast(errorMessage, 'error');
            if(authError) {
                authError.textContent = errorMessage;
                authError.classList.remove('hidden');
            }
        } finally {
            authButton.disabled = false;
            authButton.textContent = 'Войти';
        }
    }

    async function onLoginSuccess(session) {
        userData.email = session.user.email;
        userData.token = session.access_token;
        userData.role = session.user.user_metadata?.role;

        authView.classList.add('hidden');

        if (userData.role === 'admin') {
            adminView.classList.remove('hidden');
            if (window.initAdminPanel) {
                window.initAdminPanel(session.access_token);
            }
        } else {
            appView.classList.remove('hidden');
            showLoader();
            await showMainMenu();
            hideLoader();
        }
    }

    async function handleLogout() {
        await supabaseClient.auth.signOut();
        userData.token = null;
        userData.email = '';
        userData.role = null;
        sessionStorage.clear();

        appView.classList.add('hidden');
        adminView.classList.add('hidden');
        authView.classList.remove('hidden');

        const emailInput = document.getElementById('user-email');
        const passwordInput = document.getElementById('user-password');
        if(emailInput) emailInput.value = '';
        if(passwordInput) passwordInput.value = '';
    }

    async function checkSession() {
        showLoader();
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            await onLoginSuccess(session);
        } else {
            authView.classList.remove('hidden');
            hideLoader();
        }
    }

    async function showMainMenu() {
        // Implementation will be filled in later during refactoring
    }

    // --- Event Listeners ---
    if(authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin(document.getElementById('user-email').value.trim(), document.getElementById('user-password').value.trim());
        });
    }
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if(adminLogoutBtn) adminLogoutBtn.addEventListener('click', handleLogout);

    checkSession();
});