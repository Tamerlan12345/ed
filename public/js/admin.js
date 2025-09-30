window.initAdminPanel = (token) => {
    let adminToken = token;
    let allCoursesData = [];
    let currentPage = 1;
    const coursesPerPage = 10;
    let searchQuery = '';
    let allDepartments = [];
    let currentEditingCourseId = null;
    let currentEditingGroupId = null;
    let autosaveTimer = null;

    // --- DOM ELEMENTS ---
    const panelView = document.getElementById('panel-view');
    const allViews = [
        document.getElementById('courses-view'),
        document.getElementById('groups-view'),
        document.getElementById('results-view'),
        document.getElementById('leaderboard-view'),
        document.getElementById('simulator-results-view')
    ];
    const allBtns = [
        document.getElementById('courses-tab-btn'),
        document.getElementById('groups-tab-btn'),
        document.getElementById('results-tab-btn'),
        document.getElementById('leaderboard-tab-btn'),
        document.getElementById('simulator-tab-btn')
    ];
    const coursesGrid = document.getElementById('courses-grid');
    const groupFormContainer = document.getElementById('group-form-container');
    const groupFormHeader = document.getElementById('group-form-header');
    const groupsTableBody = document.getElementById('groups-table')?.getElementsByTagName('tbody')[0];
    const cancelGroupEditBtn = document.getElementById('cancel-group-edit-btn');
    const groupNameInput = document.getElementById('group-name');
    const newEmployeesCheckbox = document.getElementById('group-for-new-employees');
    const allCoursesList = document.getElementById('all-courses-list');
    const groupCoursesList = document.getElementById('group-courses-list');

    // This file assumes api.js and ui.js are already loaded.

    function switchTab(activeTab, activeBtn) {
        if(!activeTab || !activeBtn) return;
        allViews.forEach(view => view?.classList.add('hidden'));
        allBtns.forEach(btn => btn?.classList.remove('active'));
        activeTab.classList.remove('hidden');
        activeBtn.classList.add('active');
    }

    async function loadCourses() {
        if (!coursesGrid) return;
        coursesGrid.innerHTML = '<p style="text-align:center; grid-column: 1 / -1;">Загрузка...</p>';
        try {
            const courses = await apiFetch('/api/courses');
            allCoursesData = courses;
            searchQuery = '';
            const searchInput = document.getElementById('course-search-input');
            if(searchInput) searchInput.value = '';
            currentPage = 1;
            displayCourses();
        } catch (e) {
            console.error("Failed to load courses:", e);
            if(coursesGrid) coursesGrid.innerHTML = `<p style="text-align:center; color:red;">${e.message}</p>`;
        }
    }

    function displayCourses() {
        if (!coursesGrid) return;
        const filteredCourses = allCoursesData.filter(course => {
            const title = course.title || '';
            const groupName = course.group_name || '';
            const searchLower = searchQuery.toLowerCase();
            return title.toLowerCase().includes(searchLower) ||
                   groupName.toLowerCase().includes(searchLower);
        }).sort((a, b) => a.title.localeCompare(b.title));

        const totalPages = Math.ceil(filteredCourses.length / coursesPerPage);
        currentPage = Math.max(1, Math.min(currentPage, totalPages || 1));

        const startIndex = (currentPage - 1) * coursesPerPage;
        const paginatedCourses = filteredCourses.slice(startIndex, startIndex + coursesPerPage);

        coursesGrid.innerHTML = '';

        if (paginatedCourses.length === 0) {
            const messageP = document.createElement('p');
            messageP.textContent = 'Курсы не найдены.';
            messageP.style.textAlign = 'center';
            messageP.style.gridColumn = '1 / -1';
            coursesGrid.appendChild(messageP);
        } else {
            paginatedCourses.forEach(course => {
                const courseCard = createAdminCourseCard(course, loadCourseForEditing, deleteCourse);
                coursesGrid.appendChild(courseCard);
            });
        }

        const pageInfo = document.getElementById('page-info');
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');

        if(pageInfo) pageInfo.textContent = `Страница ${currentPage} из ${totalPages || 1}`;
        if(prevBtn) prevBtn.disabled = currentPage === 1;
        if(nextBtn) nextBtn.disabled = currentPage >= totalPages;
    }

    async function loadCourseForEditing(courseId) {
        // Implementation will be filled in later
    }

    async function deleteCourse(courseId, courseTitle) {
         if (!confirm(`Удалить курс "${courseTitle}"? Это действие необратимо.`)) return;
        try {
            await apiFetch(`/api/courses/${courseId}`, { method: 'DELETE' });
            showToast('Курс удален.', 'success');
            loadCourses();
        } catch (e) { /* Handled in apiFetch */ }
    }


    // --- Event Listeners ---
    allBtns.forEach((btn, index) => {
        if(btn) {
            btn.addEventListener('click', async () => {
                switchTab(allViews[index], btn);
                if (allViews[index]?.id === 'courses-view') loadCourses();
                // ... other tab initializations
            });
        }
    });

    const createFormBtn = document.getElementById('show-create-form-btn');
    if(createFormBtn) {
        createFormBtn.addEventListener('click', () => {
            // Logic to render and display the course creation form
        });
    }

    // --- Initial Load ---
    if(panelView.classList.contains('hidden') === false) {
        loadCourses();
    }
};