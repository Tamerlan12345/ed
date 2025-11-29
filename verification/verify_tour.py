from playwright.sync_api import sync_playwright
import os

def verify_tour():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Устанавливаем размер окна, достаточный для десктопа
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # 1. Открываем index.html
        print("Opening index.html...")
        # Get absolute path to index.html
        cwd = os.getcwd()
        page.goto(f"file://{cwd}/index.html")

        # 2. Инжектируем мок API и сессии, чтобы пропустить логин
        print("Injecting mocks...")
        page.evaluate("""
            () => {
                // Мокаем сессию
                window.userData = { email: 'test1@cic.kz', token: 'mock-token' };
                // Мокаем функцию fetchAuthenticated
                window.fetchAuthenticated = async (url, options) => {
                    console.log('Mock fetch called for:', url);

                    if (url.includes('getCourses')) {
                        return [{
                            id: 'group1',
                            group_name: 'Обязательные курсы',
                            courses: [{
                                id: 'course1',
                                title: 'Введение в страхование',
                                description: 'Базовый курс',
                                is_locked: false,
                                progress: { percentage: 0 },
                                user_status: 'assigned'
                            }]
                        }];
                    }
                    if (url.includes('getCourseContent')) {
                         return {
                             summary: [
                                 { html_content: '<p>Слайд 1</p>', slide_title: 'Intro' },
                                 { html_content: '<p>Слайд 2</p>', slide_title: 'Content' }
                             ],
                             questions: [],
                             materials: []
                         };
                    }
                    return {};
                };

                // Переключаем вью на app-view
                document.getElementById('auth-view').classList.add('hidden');
                document.getElementById('app-view').classList.remove('hidden');

                // Скрываем лоадер
                document.getElementById('content-loader').classList.add('hidden');

                // Инициализируем меню
                if (window.showMainMenu) window.showMainMenu();
            }
        """)

        # 3. Ждем появления кнопки "Как это работает?"
        print("Waiting for tour button...")
        page.wait_for_selector("#start-tour-btn")

        # 4. Нажимаем на кнопку "Как это работает?"
        print("Starting tour...")
        page.click("#start-tour-btn")

        # 5. Ждем появления персонажа и оверлея
        print("Waiting for character...")
        page.wait_for_selector("#character-widget")
        page.wait_for_selector("#onboarding-overlay")

        # Ждем, пока анимация бега закончится (2 секунды) и появится пузырь
        print("Waiting for running animation to finish...")
        page.wait_for_timeout(2500)

        page.wait_for_selector(".character-bubble.visible")

        # Скриншот 1: Приветствие (Бейбит)
        page.screenshot(path="verification/step1_welcome.png")
        print("Screenshot 1 taken: Welcome")

        # 6. Кликаем "Далее", чтобы перейти к меню
        print("Clicking Next...")
        # Ищем кнопку "Далее" внутри пузыря
        page.click(".bubble-actions button:has-text('Далее')")

        page.wait_for_timeout(1000)
        page.screenshot(path="verification/step2_menu.png")
        print("Screenshot 2 taken: Menu Explanation")

        # 7. Переход к следующему шагу (Клик по карте)
        # В сценарии Бейбит говорит "Давайте откроем первый курс" и сам кликает
        print("Waiting for auto-click logic...")
        page.click(".bubble-actions button:has-text('Далее')") # Переход к шагу 3 (авто-клик)

        # Ждем пока откроется курс (Presentation View)
        page.wait_for_selector(".presentation-view-container")

        # Ждем пока появится Татьяна
        print("Waiting for character switch...")
        page.wait_for_timeout(2000) # Задержка из JS (waitFor + delay)

        # Скриншот 3: Внутри курса (Татьяна)
        page.screenshot(path="verification/step3_course_tatiana.png")
        print("Screenshot 3 taken: Course View with Tatiana")

        browser.close()

if __name__ == "__main__":
    verify_tour()
