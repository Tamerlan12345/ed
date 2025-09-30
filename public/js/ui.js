/**
 * ui.js
 *
 * Содержит фабричные функции для создания переиспользуемых компонентов UI.
 * Этот подход инкапсулирует создание DOM-элементов и делает основной код приложения чище.
 * Все текстовые данные вставляются через `textContent` для предотвращения XSS-атак.
 */

/**
 * Создает иконку FontAwesome.
 * @param {string[]} classes - Массив CSS-классов для тега <i>.
 * @returns {HTMLElement} - Элемент <i>.
 */
function createIcon(classes) {
    const icon = document.createElement('i');
    icon.classList.add(...classes);
    return icon;
}

/**
 * Создает стандартный элемент кнопки.
 * @param {string} text - Текст кнопки.
 * @param {string[]} classes - Массив CSS-классов.
 * @param {function} onClick - Функция обратного вызова при клике.
 * @returns {HTMLButtonElement} - Созданный элемент кнопки.
 */
function createButton(text, classes = [], onClick = null) {
    const button = document.createElement('button');
    button.textContent = text;
    if (classes.length > 0) {
        button.classList.add(...classes);
    }
    if (onClick) {
        button.addEventListener('click', onClick);
    }
    return button;
}

/**
 * Создает карточку курса для админ-панели.
 * @param {object} course - Объект с данными курса.
 * @param {function} onEdit - Функция обратного вызова для кнопки "Редактировать".
 * @param {function} onDelete - Функция обратного вызова для кнопки "Удалить".
 * @returns {HTMLDivElement} - DOM-элемент карточки курса.
 */
function createAdminCourseCard(course, onEdit, onDelete) {
    const card = document.createElement('div');
    card.className = 'course-card';
    card.id = `course-card-${course.id}`;

    const contentDiv = document.createElement('div');

    const title = document.createElement('h4');
    title.textContent = course.title;
    if (course.group_name) {
        const groupSpan = document.createElement('span');
        groupSpan.style.cssText = "color: #6c757d; font-style: italic;";
        groupSpan.textContent = ` (${course.group_name})`;
        title.appendChild(groupSpan);
    }
    contentDiv.appendChild(title);

    const idP = document.createElement('p');
    const idStrong = document.createElement('strong');
    idStrong.textContent = 'ID:';
    idP.appendChild(idStrong);
    idP.appendChild(document.createTextNode(` ${course.id}`));
    contentDiv.appendChild(idP);

    const statusP = document.createElement('p');
    const statusStrong = document.createElement('strong');
    statusStrong.textContent = 'Статус:';
    statusP.appendChild(statusStrong);
    statusP.appendChild(document.createTextNode(' '));

    const statusSpan = document.createElement('span');
    statusSpan.className = `status-${course.status || 'draft'}`;
    statusSpan.textContent = `${course.status === 'published' ? 'Опубликован' : 'Черновик'} ${course.is_visible ? ' (Виден)' : ''}`;
    statusP.appendChild(statusSpan);
    contentDiv.appendChild(statusP);

    const jobStatusDiv = document.createElement('div');
    jobStatusDiv.className = 'job-status-indicator';
    jobStatusDiv.id = `job-status-${course.id}`;
    jobStatusDiv.style.cssText = "font-style: italic; color: #005A9C; margin-top: 5px;";
    contentDiv.appendChild(jobStatusDiv);

    const actionsCell = document.createElement('div');
    actionsCell.className = 'actions-cell';

    const editButton = createButton('Редактировать', [], () => onEdit(course.id));
    editButton.id = `edit-btn-${course.id}`;

    const deleteButton = createButton('Удалить', [], () => onDelete(course.id, course.title));
    deleteButton.style.backgroundColor = 'var(--error-color)';

    actionsCell.appendChild(editButton);
    actionsCell.appendChild(deleteButton);

    card.appendChild(contentDiv);
    card.appendChild(actionsCell);

    return card;
}

/**
 * Создает строку для таблицы групп.
 * @param {object} group - Объект с данными группы.
 * @param {function} onEdit - Функция обратного вызова для кнопки "Редактировать".
 * @param {function} onDelete - Функция обратного вызова для кнопки "Удалить".
 * @returns {HTMLTableRowElement} - DOM-элемент строки таблицы.
 */
function createGroupTableRow(group, onEdit, onDelete) {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = group.group_name;
    row.appendChild(nameCell);

    const newEmpCell = document.createElement('td');
    newEmpCell.textContent = group.is_for_new_employees ? 'Да' : 'Нет';
    row.appendChild(newEmpCell);

    const visibleCell = document.createElement('td');
    visibleCell.textContent = group.is_visible ? 'Да' : 'Нет';
    row.appendChild(visibleCell);

    const orderCell = document.createElement('td');
    orderCell.textContent = group.enforce_order ? 'Да' : 'Нет';
    row.appendChild(orderCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-cell';
    const editButton = createButton('Редактировать', [], () => onEdit(group.id));
    const deleteButton = createButton('Удалить', [], () => onDelete(group.id, group.group_name));
    deleteButton.style.backgroundColor = '#dc3545';
    actionsCell.appendChild(editButton);
    actionsCell.appendChild(deleteButton);
    row.appendChild(actionsCell);

    return row;
}

/**
 * Создает строку для таблицы студентов.
 * @param {object} student - Объект с данными студента.
 * @returns {HTMLTableRowElement} - DOM-элемент строки таблицы.
 */
function createStudentTableRow(student) {
    const row = document.createElement('tr');
    row.dataset.email = student.email;

    const emailCell = document.createElement('td');
    emailCell.textContent = student.email;
    row.appendChild(emailCell);

    const nameCell = document.createElement('td');
    nameCell.textContent = student.full_name;
    row.appendChild(nameCell);

    const departmentCell = document.createElement('td');
    departmentCell.textContent = student.department;
    row.appendChild(departmentCell);

    return row;
}