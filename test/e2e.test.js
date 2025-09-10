const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const request = require('supertest');
const app = require('../server/index.js'); // Import the Express app

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase URL and service key are required to run tests.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Test Data ---
const testUser = {
    email: `test-user-${uuidv4()}@example.com`,
    password: 'password123',
    id: null,
    token: null,
};

let testCourse = {
    id: null,
    title: `Test Course ${uuidv4()}`,
};

// --- Test Suite ---
describe('E2E System Tests with Supertest', function() {
    this.timeout(30000);

    // --- Setup and Teardown ---
    before(async () => {
        // Create a new user for testing
        const { data: user, error: userError } = await supabaseAdmin.auth.admin.createUser({
            email: testUser.email,
            password: testUser.password,
            email_confirm: true,
        });
        if (userError) throw new Error(`Failed to create test user: ${userError.message}`);
        testUser.id = user.user.id;
        console.log(`Successfully created test user: ${testUser.email}`);

        // Create a test course
        const { data: course, error: courseError } = await supabaseAdmin
            .from('courses')
            .insert({
                title: testCourse.title,
                description: 'This is a test description.',
                content: JSON.stringify({
                    summary: [{ title: "Test Summary", html_content: "<p>Hello</p>" }],
                    questions: [{ question: "Is this a test?", options: ["Yes", "No"], correct_option_index: 0 }]
                })
            })
            .select()
            .single();
        if (courseError) throw new Error(`Failed to create test course: ${courseError.message}`);
        testCourse.id = course.id;
        console.log(`Successfully created test course: ${testCourse.title} (ID: ${testCourse.id})`);

        // Log in the user to get a token
        const { data: loginData, error: loginError } = await supabaseAdmin.auth.signInWithPassword({
            email: testUser.email,
            password: testUser.password,
        });
        if (loginError) throw new Error(`Failed to log in test user: ${loginError.message}`);
        testUser.token = loginData.session.access_token;
    });

    after(async () => {
        // Cleanup: delete all created resources
        if (testUser.id) {
            await supabaseAdmin.auth.admin.deleteUser(testUser.id);
            console.log(`Cleaned up test user: ${testUser.email}`);
        }
        if (testCourse.id) {
            await supabaseAdmin.from('courses').delete().eq('id', testCourse.id);
            console.log(`Cleaned up test course: ${testCourse.title}`);
        }
    });

    // --- Tests ---
    it('should allow user to see the new course in the catalog and self-assign it', async () => {
        const res1 = await request(app)
            .post('/api/getCourses')
            .set('Authorization', `Bearer ${testUser.token}`)
            .expect(200);

        const courseInCatalog = res1.body.courses.find(c => c.id === testCourse.id && !c.isAssigned);
        assert(courseInCatalog, 'Test course should be available in the catalog');

        await request(app)
            .post('/api/assign-course')
            .set('Authorization', `Bearer ${testUser.token}`)
            .send({ course_id: testCourse.id })
            .expect(200);

        const res2 = await request(app)
            .post('/api/getCourses')
            .set('Authorization', `Bearer ${testUser.token}`)
            .expect(200);

        const assignedCourse = res2.body.courses.find(c => c.id === testCourse.id);
        assert(assignedCourse.isAssigned, 'Course should now be assigned to the user');
        assert(!res2.body.userProgress[testCourse.id]?.completed, 'Course should not be completed yet');
    });

    it('should return 404 when trying to assign a non-existent course', async () => {
        const nonExistentCourseId = uuidv4();

        await request(app)
            .post('/api/assign-course')
            .set('Authorization', `Bearer ${testUser.token}`)
            .send({ course_id: nonExistentCourseId })
            .expect(404);
    });

    it('should allow user to pass the test and mark the course as complete', async () => {
        await request(app)
            .post('/api/saveTestResult')
            .set('Authorization', `Bearer ${testUser.token}`)
            .send({
                course_id: testCourse.id,
                score: 1,
                total_questions: 1,
                percentage: 100,
            })
            .expect(200);

        const res = await request(app)
            .post('/api/getCourses')
            .set('Authorization', `Bearer ${testUser.token}`)
            .expect(200);

        const progress = res.body.userProgress[testCourse.id];
        assert(progress, 'User progress should exist for the course');
        assert(progress.completed, 'Course should be marked as completed');
        assert.strictEqual(progress.score, 1, 'Score should be saved correctly');
    });

    it('should be able to fetch the global leaderboard', async () => {
        const res = await request(app)
            .post('/api/get-leaderboard')
            .set('Authorization', `Bearer ${testUser.token}`)
            .expect(200);

        assert(Array.isArray(res.body), 'Leaderboard data should be an array');
        const userOnLeaderboard = res.body.find(u => u.user_email === testUser.email);
        assert(userOnLeaderboard, 'Test user should be on the leaderboard after completing a course');
        assert.strictEqual(userOnLeaderboard.courses_completed, 1, 'User should have 1 course completed on the leaderboard');
    });
});
