// --- MODULE SCOPE VARIABLES ---
const state = {
    supabaseClient: null,
    token: null,
    email: '',
    courses: [],
    currentCourse: null,
    currentQuestions: [],
    currentQuestionIndex: 0,
    score: 0,
    tabSwitchCount: 0,
    simulationHistory: [],
    timeTrackingInterval: null,
    secondsSinceLastUpdate: 0,
};

const DOMElements = {
    authView: document.getElementById('auth-view'),
    appView: document.getElementById('app-view'),
    authForm: document.getElementById('auth-form'),
    authError: document.getElementById('auth-error'),
    contentArea: document.getElementById('content-area'),
    mainMenu: document.getElementById('main-menu'),
    productContent: document.getElementById('product-content'),
    testView: document.getElementById('test-view'),
    testResultsView: document.getElementById('test-results'),
    simulatorView: document.getElementById('simulator-view'),
    windowTitle: document.getElementById('window-title'),
    backToMenuBtn: document.getElementById('back-to-menu-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    contentLoader: document.getElementById('content-loader'),
    mainMenuTabs: document.getElementById('main-menu-tabs'),
    courseSearchInput: document.getElementById('course-search-input'),
    toastContainer: document.getElementById('toast-container'),
};

const Utils = {
    populateTemplate(templateId, selectors) {
        const template = document.getElementById(templateId);
        if (!template) return null;
        const clone = template.content.cloneNode(true);
        for (const key in selectors) {
            const el = clone.querySelector(`.${key}`);
            if (el) {
                if (selectors[key] instanceof Node || selectors[key] instanceof DocumentFragment) {
                    el.innerHTML = '';
                    el.appendChild(selectors[key]);
                } else {
                    el.innerHTML = selectors[key];
                }
            }
        }
        return clone.firstElementChild;
    }
};

const ApiConnector = {
    async fetchAuthenticated(url, options = {}) {
        if (!state.token) throw new Error("Пользователь не авторизован.");
        const finalOptions = {
            ...options,
            headers: { 'Authorization': `Bearer ${state.token}`, 'Content-Type': 'application/json', ...options.headers },
        };
        const response = await fetch(url, finalOptions);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Ошибка сервера: ${response.status}` }));
            throw new Error(errorData.error);
        }
        return response.json();
    }
};

const UIManager = {
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} show`;
        toast.textContent = message;
        DOMElements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 5000);
    },
    showLoader() {
        DOMElements.contentLoader.classList.remove('hidden');
        DOMElements.contentArea.classList.add('hidden');
    },
    hideLoader() {
        DOMElements.contentLoader.classList.add('hidden');
        DOMElements.contentArea.classList.remove('hidden');
    },
    showMessage(message, details = '') {
        DOMElements.contentArea.innerHTML = `<div class="message">${message}<br><small style="color: #999;">${details}</small></div>`;
        this.hideLoader();
    },
    setWindow(viewToShow) {
        [DOMElements.mainMenu, DOMElements.productContent, DOMElements.testView, DOMElements.testResultsView, DOMElements.simulatorView].forEach(v => v.classList.add('hidden'));
         document.getElementById('main-content-wrapper').classList.add('hidden');
        if (viewToShow) {
             document.getElementById('main-content-wrapper').classList.remove('hidden');
            viewToShow.classList.remove('hidden');
        }
    },
    setHeader(title, showBackButton = false, backButtonAction = null) {
        DOMElements.windowTitle.textContent = title;
        DOMElements.backToMenuBtn.classList.toggle('hidden', !showBackButton);
        state.backButtonAction = backButtonAction;
    }
};

const AuthManager = {
    async init() {
        DOMElements.authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin(document.getElementById('user-email').value.trim(), document.getElementById('user-password').value.trim());
        });
        DOMElements.logoutBtn.addEventListener('click', () => this.handleLogout());
        UIManager.showLoader();
        const { data: { session } } = await state.supabaseClient.auth.getSession();
        if (session) await this.onLoginSuccess(session);
        else {
            DOMElements.authView.classList.remove('hidden');
            UIManager.hideLoader();
        }
    },
    async handleLogin(email, password) {
        const authButton = document.getElementById('auth-button');
        authButton.disabled = true;
        authButton.textContent = 'Вход...';
        DOMElements.authError.classList.add('hidden');
        try {
            const { data, error } = await state.supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await this.onLoginSuccess(data.session);
        } catch (error) {
            DOMElements.authError.textContent = 'Неверный логин или пароль.';
            DOMElements.authError.classList.remove('hidden');
        } finally {
            authButton.disabled = false;
            authButton.textContent = 'Войти';
        }
    },
    async onLoginSuccess(session) {
        state.email = session.user.email;
        state.token = session.access_token;
        DOMElements.authView.classList.add('hidden');
        DOMElements.appView.classList.remove('hidden');
        await CourseManager.showMainMenu();
    },
    async handleLogout() {
        await state.supabaseClient.auth.signOut();
        state.token = null;
        state.email = '';
        sessionStorage.clear();
        DOMElements.appView.classList.add('hidden');
        DOMElements.authView.classList.remove('hidden');
    }
};

const CourseManager = {
    async showMainMenu() {
        TimeTracker.stop();
        UIManager.setHeader('Главное Меню', false);
        UIManager.setWindow(DOMElements.mainMenu);
        DOMElements.mainMenuTabs.classList.remove('hidden');
        document.getElementById('extra-tools').classList.remove('hidden');
        UIManager.showLoader();
        try {
            state.courses = await ApiConnector.fetchAuthenticated('/api/getCourses', { method: 'POST' });
            this.renderFilteredCourses();
        } catch (error) {
            UIManager.showMessage('Не удалось загрузить курсы.', error.message);
        } finally {
            UIManager.hideLoader();
        }
    },
    renderFilteredCourses() {
        const activeTab = DOMElements.mainMenuTabs.querySelector('.tab-btn.active');
        const filter = activeTab ? activeTab.dataset.filter : 'assigned';
        const searchTerm = DOMElements.courseSearchInput.value;
        if (filter === 'catalog') this.renderCatalog(searchTerm);
        else this.renderCourseGroups(filter, searchTerm);
    },
    renderCourseGroups(filter, searchTerm) {
        DOMElements.mainMenu.innerHTML = '';
        const term = searchTerm.toLowerCase();
        const filteredGroups = state.courses.map(group => ({...group, courses: group.courses.filter(course => {
            const isCompleted = !!course.progress?.completed_at;
            const matchesFilter = (filter === 'completed') ? isCompleted : !isCompleted;
            const matchesSearch = !term || (course.title && course.title.toLowerCase().includes(term));
            return matchesFilter && matchesSearch;
        })})).filter(group => group.courses.length > 0);
        if (filteredGroups.length === 0) {
            DOMElements.mainMenu.innerHTML = `<p class="message">Нет курсов для отображения.</p>`;
            return;
        }
        filteredGroups.forEach(group => {
            const groupContainer = document.createElement('div');
            groupContainer.className = 'course-group-container';
            groupContainer.innerHTML = `<h3>${group.group_name}</h3>`;
            const coursesGrid = document.createElement('div');
            coursesGrid.className = 'main-menu';
            group.courses.forEach(course => coursesGrid.appendChild(this.createCourseMenuItem(course)));
            groupContainer.appendChild(coursesGrid);
            DOMElements.mainMenu.appendChild(groupContainer);
        });
    },
    createCourseMenuItem(course) {
        const progressBar = document.createElement('div');
        if (course.progress?.percentage > 0 && !course.progress?.completed_at) {
            progressBar.innerHTML = `<div style="width: 100%; background: #eee; border-radius: 5px; margin-top: 10px;"><div style="width: ${course.progress.percentage}%; background: var(--success-color); height: 5px; border-radius: 5px;"></div></div>`;
        }
        const deadline = document.createElement('div');
        if (course.progress?.deadline_date && !course.progress?.completed_at) {
            const d = new Date(course.progress.deadline_date);
            const isOverdue = new Date(d.toDateString()) < new Date(new Date().toDateString());
            deadline.innerHTML = `<p style="font-size: 0.85em; color: ${isOverdue ? 'var(--error-color)' : 'var(--text-light-color)'}; margin-top: 10px; font-weight: bold;"><i class="fa-solid fa-clock"></i> Срок сдачи: ${d.toLocaleDateString('ru-RU')} ${isOverdue ? '(Просрочено)' : ''}</p>`;
        }
        const menuItem = Utils.populateTemplate('course-menu-item-template', {
            'menu-item-icon': course.is_locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-book-open"></i>',
            'course-title': course.title,
            'progress-bar': progressBar,
            'deadline': deadline,
        });
        if (course.is_locked) {
            menuItem.style.opacity = '0.6';
            menuItem.style.cursor = 'not-allowed';
            menuItem.title = 'Этот курс будет доступен после прохождения предыдущего';
        } else {
            menuItem.addEventListener('click', () => PresentationManager.show(course.id));
        }
        if (course.progress?.completed_at) menuItem.classList.add('completed');
        return menuItem;
    },
    async renderCatalog(searchTerm) {
        // ...
    },
    async assignCourse(courseId, button) {
        // ...
    }
};

const PresentationManager = {
    async show(courseId) {
        // ...
    }
};

const TimeTracker = {
    start(courseId) {
        // ...
    },
    stop() {
        // ...
    }
};

const App = {
    async init() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Не удалось загрузить конфигурацию.');
            const config = await response.json();
            state.supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            await AuthManager.init();
            this.attachGlobalListeners();
        } catch (error) {
            document.body.innerHTML = `<div style="text-align: center; padding: 20px; color: red;">${error.message}</div>`;
        }
    },
    attachGlobalListeners() {
        DOMElements.backToMenuBtn.addEventListener('click', () => {
            DOMElements.appView.classList.remove('presentation-mode-active');
            if (typeof state.backButtonAction === 'function') state.backButtonAction();
            else CourseManager.showMainMenu();
        });
        DOMElements.mainMenuTabs.addEventListener('click', (e) => {
            if (e.target.matches('.tab-btn')) {
                DOMElements.mainMenuTabs.querySelector('.tab-btn.active').classList.remove('active');
                e.target.classList.add('active');
                CourseManager.renderFilteredCourses();
            }
        });
        DOMElements.courseSearchInput.addEventListener('input', () => CourseManager.renderFilteredCourses());
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());