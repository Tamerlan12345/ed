// --- MODULE SCOPE VARIABLES ---
const state = {
    supabaseClient: null,
    adminToken: null,
    allCoursesData: [],
    currentPage: 1,
    coursesPerPage: 10,
    searchQuery: '',
    allDepartments: [],
    currentEditingCourseId: null,
    currentEditingGroupId: null,
    autosaveTimer: null,
    apiJobs: {},
    allStudents: [],
    currentFilteredStudents: [],
    studentCurrentPage: 1,
    studentsPerPage: 50,
    selectedStudentEmail: null,
};

const DOMElements = {
    loginView: document.getElementById('login-view'),
    panelView: document.getElementById('panel-view'),
    toastContainer: document.getElementById('toast-container'),
    allViews: Array.from(document.querySelectorAll('#panel-view > div[id$="-view"]')),
    allTabBtns: Array.from(document.querySelectorAll('.tabs button')),
    coursesGrid: document.getElementById('courses-grid'),
    courseFormWrapper: document.getElementById('course-form-wrapper'),
    groupsTableBody: document.getElementById('groups-table')?.querySelector('tbody'),
};

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

const ApiConnector = {
    activeCalls: 0,
    updateApiState(change) {
        this.activeCalls += change;
    },
    async call(action, payload = {}) {
        if (!state.adminToken) {
            UIManager.showToast('Ошибка: вы не авторизованы.', 'error');
            throw new Error('Not authorized');
        }
        this.updateApiState(1);
        try {
            const response = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.adminToken}`, 'Content-Type': 'application/json' },
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
                UIManager.showToast(`${fieldName}: ${errorData.details[fieldName]}`, 'error');
            }
        } else if (errorData && errorData.error) {
            UIManager.showToast(errorData.error, 'error');
        } else {
            UIManager.showToast('Произошла неизвестная ошибка.', 'error');
        }
    },
    switchTab(activeTab, activeBtn) {
        DOMElements.allViews.forEach(view => view.classList.add('hidden'));
        DOMElements.allTabBtns.forEach(btn => btn.classList.remove('active'));
        if (activeTab) activeTab.classList.remove('hidden');
        if (activeBtn) activeBtn.classList.add('active');
    },
    renderCoursesGrid() {
        const filtered = state.allCoursesData.filter(c => c.title.toLowerCase().includes(state.searchQuery));
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
        }

        DOMElements.courseFormWrapper.innerHTML = '';
        DOMElements.courseFormWrapper.appendChild(formClone);
        App.attachCourseFormListeners();
    },
};

const AuthManager = {
    init() {
        document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        state.supabaseClient.auth.getSession().then(({ data }) => {
            if (data.session) this.onLoginSuccess(data.session);
            else DOMElements.loginView.classList.remove('hidden');
        });
    },
    async handleLogin() {
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        const { data, error } = await state.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) UIManager.showToast(`Ошибка входа: ${error.message}`, 'error');
        else await this.onLoginSuccess(data.session);
    },
    async onLoginSuccess(session) {
        const { data: { user } } = await state.supabaseClient.auth.getUser();
        const { data: adminCheck, error } = await state.supabaseClient.from('users').select('is_admin').eq('id', user.id).single();
        if (error || !adminCheck?.is_admin) {
            UIManager.showToast('Доступ запрещен.', 'error');
            return this.handleLogout();
        }
        state.adminToken = session.access_token;
        DOMElements.loginView.classList.add('hidden');
        DOMElements.panelView.classList.remove('hidden');
        App.loadInitialData();
    },
    async handleLogout() {
        await state.supabaseClient.auth.signOut();
        state.adminToken = null;
        DOMElements.panelView.classList.add('hidden');
        DOMElements.loginView.classList.remove('hidden');
    }
};

const CourseManager = {
    async loadCourses() {
        try {
            state.allCoursesData = await ApiConnector.call('GET_COURSES_ADMIN');
            UIManager.renderCoursesGrid();
        } catch (e) { /* error handled in ApiConnector */ }
    },
    async deleteCourse(courseId, courseTitle) {
        if (confirm(`Удалить курс "${courseTitle}"?`)) {
            try {
                await ApiConnector.call('DELETE_COURSE', { course_id: courseId });
                UIManager.showToast('Курс удален.', 'success');
                this.loadCourses();
            } catch (e) { /* error handled */ }
        }
    },
    loadCourseForEditing(courseId) {
        ApiConnector.call('GET_COURSE_DETAILS', { course_id: courseId })
            .then(course => UIManager.renderCourseForm(course))
            .catch(e => {});
    }
};

const App = {
    async init() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Failed to fetch config');
            const config = await response.json();
            state.supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            AuthManager.init();
            this.attachEventListeners();
        } catch (error) {
            document.body.innerHTML = 'Error initializing application.';
        }
    },
    loadInitialData() {
        DOMElements.allTabBtns[0].click();
    },
    attachEventListeners() {
        DOMElements.allTabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.id.replace('-tab-btn', '-view');
                const view = document.getElementById(targetId);
                UIManager.switchTab(view, e.target);
                if (targetId === 'courses-view') CourseManager.loadCourses();
            });
        });
        document.getElementById('show-create-form-btn').addEventListener('click', () => UIManager.renderCourseForm());
    },
    attachCourseFormListeners() {
        const form = DOMElements.courseFormWrapper;
        form.querySelector('#publish-btn')?.addEventListener('click', async () => {
            const payload = {
                course_id: form.querySelector('#course-id').value,
                title: form.querySelector('#course-title').value,
            };
            try {
                await ApiConnector.call('PUBLISH_COURSE', payload);
                UIManager.showToast('Курс опубликован!', 'success');
                CourseManager.loadCourses();
                DOMElements.courseFormWrapper.innerHTML = '';
            } catch(e) {}
        });

        form.querySelector('#process-questions-file-btn')?.addEventListener('click', async () => {
            const courseId = form.querySelector('#course-id').value;
            if (!courseId) {
                UIManager.showToast('Пожалуйста, сначала создайте курс (хотя бы черновик), чтобы получить ID.', 'error');
                return;
            }
            const fileInput = form.querySelector('#questions-file-uploader');
            const file = fileInput.files[0];
            if (!file) {
                UIManager.showToast('Пожалуйста, выберите файл для загрузки.', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const fileData = event.target.result.split(',')[1]; // Get base64 part
                    const payload = {
                        course_id: courseId,
                        file_name: file.name,
                        file_data: fileData,
                    };
                    await ApiConnector.call('UPLOAD_AND_PARSE_QUESTIONS', payload);
                    UIManager.showToast('Файл отправлен на обработку. Вопросы появятся в редакторе через несколько минут.', 'info');
                } catch (e) {
                    // Error is already handled by ApiConnector, but you could add specific logic here if needed
                }
            };
            reader.onerror = () => {
                UIManager.showToast('Не удалось прочитать файл.', 'error');
            };
            reader.readAsDataURL(file);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());