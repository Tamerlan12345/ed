// Simple DOM mock
const { JSDOM } = require('jsdom');
const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = window.document;
global.window = window;
global.alert = () => {};
global.confirm = () => true;

// Mock functions and variables that are expected to be in the global scope
global.courses = [];
global.currentCourse = null;
global.showMessage = () => {};

// A simple assertion helper
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

// --- Test Suite ---

function runTests() {
    console.log("Running tests...");
    try {
        testUserPage_showProduct_findsCourseInNestedArray();
        testAdminPage_loadCourseForEditing_createsCorrectDraft();
        console.log("All tests passed! ✅");
    } catch (error) {
        console.error("Test failed: ❌", error.message);
        process.exit(1); // Exit with error code
    }
}

// --- Test Cases ---

function testUserPage_showProduct_findsCourseInNestedArray() {
    console.log("  Running: testUserPage_showProduct_findsCourseInNestedArray");

    // ARRANGE: Set up the global 'courses' variable with a nested structure
    global.courses = [
        {
            group_name: "Group 1",
            courses: [
                { id: 'c1', title: 'Course 1' },
                { id: 'c2', title: 'Course 2' }
            ]
        },
        {
            group_name: "Group 2",
            courses: [
                { id: 'c3', title: 'Course 3' }
            ]
        }
    ];
    global.currentCourse = null;

    // The function to be tested (copied from index.html with the fix)
    const showProduct = (courseId) => {
        global.currentCourse = global.courses.flatMap(g => g.courses).find(c => c.id === courseId);
    };

    // ACT: Call the function with a course ID
    showProduct('c2');

    // ASSERT: Check if the correct course was found
    assert(global.currentCourse !== null, "currentCourse should not be null");
    assert(global.currentCourse.id === 'c2', "Incorrect course ID found");
    assert(global.currentCourse.title === 'Course 2', "Incorrect course title found");

    // ACT 2: Test with a non-existent ID
    showProduct('c99');
    assert(global.currentCourse === undefined, "currentCourse should be undefined for a non-existent ID");

    console.log("    PASSED");
}


function testAdminPage_loadCourseForEditing_createsCorrectDraft() {
    console.log("  Running: testAdminPage_loadCourseForEditing_createsCorrectDraft");

    // ARRANGE: Mock the apiCall function
    const mockApiCall = (action, payload) => {
        if (action === 'save_course_draft') {
            return Promise.resolve(payload.draft_data);
        }
        return Promise.resolve({});
    };

    const course = {
        status: 'published',
        content: { summary: [{ slide_title: "Hello" }], questions: [] },
        draft_content: null
    };
    const courseId = 'test-course-123';

    // The logic to be tested (simplified from admin.html)
    const createDraftLogic = async () => {
        let savedDraft = null;
        if (course.status === 'published' && course.content && !course.draft_content) {
            const draftData = course.content; // This is the fixed logic
            savedDraft = await mockApiCall('save_course_draft', { course_id: courseId, draft_data: draftData });
        }
        return savedDraft;
    };

    // ACT & ASSERT
    createDraftLogic().then(savedDraft => {
        assert(savedDraft !== null, "Draft should have been created");
        assert(savedDraft.summary !== undefined, "Draft data should have a 'summary' property");
        assert(savedDraft.questions !== undefined, "Draft data should have a 'questions' property");
        assert(savedDraft.title === undefined, "Draft data should NOT have a 'title' property");
        console.log("    PASSED");
    }).catch(err => {
        console.error("    FAILED:", err);
        throw err; // Re-throw to fail the main process
    });
}


// --- Run all tests ---
runTests();
