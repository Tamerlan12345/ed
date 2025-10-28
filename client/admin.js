import { store } from './state.js';

// --- DOM Element References ---
const DOMElements = {
    loginView: document.getElementById('login-view'),
    panelView: document.getElementById('panel-view'),
    toastContainer: document.getElementById('toast-container'),
    allViews: Array.from(document.querySelectorAll('#panel-view > div[id$="-view"]')),
    allTabBtns: Array.from(document.querySelectorAll('.tabs button')),
    coursesGrid: document.getElementById('courses-grid'),
    courseFormWrapper: document.getElementById('course-form-wrapper'),
    groupsTableBody: document.getElementById('groups-table')?.querySelector('tbody'),
    courseSearchInput: document.getElementById('course-search-input'),
    // Add other frequently accessed elements here
};

// --- UTILITY FUNCTIONS ---
const Utils = {
    escapeHTML(str) {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    },
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

// --- API CONNECTOR ---
const ApiConnector = {
    activeCalls: 0,
    updateApiState(change) {
        this.activeCalls += change;
        // Optionally, dispatch a global state change for loading indicators
        // store.setState({ isLoading: this.activeCalls > 0 });
    },
    async call(action, payload = {}) {
        if (!store.getState().adminToken) {
            UIManager.showToast('Ошибка: вы не авторизованы.', 'error');
            throw new Error('Not authorized');
        }
        this.updateApiState(1);
        try {
            const response = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${store.getState().adminToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...payload }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Ошибка сервера: ${response.status}` }));
                throw { status: response.status, data: errorData };
            }
            return await response.json();
        } catch (error) {
            UIManager.handleApiError(error);
            throw error;
        } finally {
            this.updateApiState(-1);
        }
    },
};

// --- UI MANAGER ---
const UIManager = {
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        DOMElements.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    },
    handleApiError(error) {
        const errorData = error.data;
        if (error.status === 400 && errorData && errorData.details) {
            for (const fieldName in errorData.details) {
                this.showToast(`${fieldName}: ${errorData.details[fieldName]}`, 'error');
            }
        } else if (errorData && errorData.error) {
            this.showToast(errorData.error, 'error');
        } else {
            this.showToast('Произошла неизвестная ошибка.', 'error');
        }
    },
    switchTab(activeTab, activeBtn) {
        DOMElements.allViews.forEach(view => view.classList.add('hidden'));
        DOMElements.allTabBtns.forEach(btn => btn.classList.remove('active'));
        if (activeTab) activeTab.classList.remove('hidden');
        if (activeBtn) activeBtn.classList.add('active');
    },
    renderCoursesGrid() {
        const { allCoursesData, searchQuery } = store.getState();
        const filtered = allCoursesData.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

        DOMElements.coursesGrid.innerHTML = '';
        if (filtered.length === 0) {
            DOMElements.coursesGrid.innerHTML = '<p>Курсы не найдены.</p>';
            return;
        }

        filtered.forEach(course => {
            const card = Utils.populateTemplate('course-card-template', {
                'course-title': Utils.escapeHTML(course.title),
                'course-id': course.id,
                'course-status': course.status,
            });
            card.querySelector('.edit-btn').addEventListener('click', () => CourseManager.loadCourseForEditing(course.id));
            card.querySelector('.delete-btn').addEventListener('click', () => CourseManager.deleteCourse(course.id, course.title));
            DOMElements.coursesGrid.appendChild(card);
        });
    },
    renderCourseForm(course = null) {
        const isEditing = !!course;
        const formClone = document.getElementById('course-form-template').content.cloneNode(true);
        const container = formClone.querySelector('#course-form-container');

        container.querySelector('#course-form-header').textContent = isEditing ? `Редактирование: ${course.title}` : 'Создать новый курс';
        if (isEditing) {
            container.querySelector('#course-id').value = course.id;
            container.querySelector('#course-title').value = course.title;
            // Populate other fields...
        }

        DOMElements.courseFormWrapper.innerHTML = '';
        DOMElements.courseFormWrapper.appendChild(formClone);
        App.attachCourseFormListeners();
    },
};

// --- AUTHENTICATION MANAGER ---
const AuthManager = {
    init() {
        document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());

        store.getState().supabaseClient.auth.getSession().then(({ data }) => {
            if (data.session) this.onLoginSuccess(data.session);
            else DOMElements.loginView.classList.remove('hidden');
        });
    },
    async handleLogin() {
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        const { data, error } = await store.getState().supabaseClient.auth.signInWithPassword({ email, password });
        if (error) UIManager.showToast(`Ошибка входа: ${error.message}`, 'error');
        else await this.onLoginSuccess(data.session);
    },
    async onLoginSuccess(session) {
        const { data: { user } } = await store.getState().supabaseClient.auth.getUser();
        const { data: adminCheck, error } = await store.getState().supabaseClient.from('users').select('is_admin').eq('id', user.id).single();

        if (error || !adminCheck?.is_admin) {
            UIManager.showToast('Доступ запрещен.', 'error');
            return this.handleLogout();
        }

        store.setState({ adminToken: session.access_token });

        DOMElements.loginView.classList.add('hidden');
        DOMElements.panelView.classList.remove('hidden');
        App.loadInitialData();
    },
    async handleLogout() {
        await store.getState().supabaseClient.auth.signOut();
        store.setState({ adminToken: null });
        DOMElements.panelView.classList.add('hidden');
        DOMElements.loginView.classList.remove('hidden');
    }
};

// --- COURSE MANAGER ---
const CourseManager = {
    async loadCourses() {
        try {
            const courses = await ApiConnector.call('GET_COURSES_ADMIN');
            store.setState({ allCoursesData: courses });
            UIManager.renderCoursesGrid();
        } catch (e) { /* error handled in ApiConnector */ }
    },
    async deleteCourse(courseId, courseTitle) {
        if (confirm(`Удалить курс "${courseTitle}"?`)) {
            try {
                await ApiConnector.call('DELETE_COURSE', { course_id: courseId });
                UIManager.showToast('Курс удален.', 'success');
                this.loadCourses(); // Reload courses after deletion
            } catch (e) { /* error handled */ }
        }
    },
    async loadCourseForEditing(courseId) {
        try {
            const course = await ApiConnector.call('GET_COURSE_DETAILS', { course_id: courseId });
            store.setState({ currentEditingCourseId: courseId });
            UIManager.renderCourseForm(course);
        } catch(e) {}
    }
};

// --- MAIN APP ---
const App = {
    async init() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Failed to fetch config');
            const config = await response.json();
            const supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            store.setState({
                supabaseClient: supabaseClient,
                adminToken: null,
                allCoursesData: [],
                currentPage: 1,
                coursesPerPage: 10,
                searchQuery: '',
                allDepartments: [],
                currentEditingCourseId: null,
                // ... other initial state properties
            });

            AuthManager.init();
            this.attachEventListeners();
        } catch (error) {
            document.body.innerHTML = 'Error initializing application.';
        }
    },
    loadInitialData() {
        DOMElements.allTabBtns[0].click(); // Programmatically click the first tab
    },
    attachEventListeners() {
        DOMElements.allTabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.id.replace('-tab-btn', '-view');
                const view = document.getElementById(targetId);
                UIManager.switchTab(view, e.target);

                // Load data based on the selected tab
                if (targetId === 'courses-view') CourseManager.loadCourses();
                // Add logic for other tabs here...
            });
        });

        document.getElementById('show-create-form-btn').addEventListener('click', () => {
            store.setState({ currentEditingCourseId: null });
            UIManager.renderCourseForm();
        });

        DOMElements.courseSearchInput.addEventListener('input', (e) => {
            store.setState({ searchQuery: e.target.value });
            UIManager.renderCoursesGrid();
        });
    },
    attachCourseFormListeners() {
        const form = DOMElements.courseFormWrapper;
        form.querySelector('#publish-btn')?.addEventListener('click', async () => {
            const payload = {
                course_id: form.querySelector('#course-id').value,
                title: form.querySelector('#course-title').value,
                // Gather other form data...
            };
            try {
                await ApiConnector.call('PUBLISH_COURSE', payload);
                UIManager.showToast('Курс опубликован!', 'success');
                CourseManager.loadCourses(); // Refresh course list
                DOMElements.courseFormWrapper.innerHTML = ''; // Clear form
            } catch(e) {}
        });
        // Add other form listeners...
    }
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => App.init());