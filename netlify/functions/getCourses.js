const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('./utils/errors');

exports.handler = async (event) => {
  try {
    // Correctly initialize Supabase client with user's auth token
    const token = event.headers.authorization.split(' ')[1];
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Now, get the user to verify the token and get the user ID
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // 1. Get all published courses. RLS policy ensures only published courses are returned.
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('course_id, title, status');
    if (coursesError) throw coursesError;

    // 2. Get user's progress for all their courses. RLS ensures they only see their own.
    const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select('course_id, percentage, attempts')
        .eq('user_id', user.id);
    if (progressError) throw progressError;

    const userProgress = {};
    progressData.forEach(p => {
        userProgress[p.course_id] = { completed: p.percentage === 100, percentage: p.percentage, attempts: p.attempts };
    });
    
    // 3. Format final course list
    // At this stage, we are not checking for assigned courses, just showing all published ones.
    // This will be improved later with a dedicated RPC function.
    const formattedCourses = courses.map(course => {
      return {
        id: course.course_id,
        title: course.title,
        // isAssigned will be properly implemented later. For now, we can base it on progress.
        isAssigned: userProgress.hasOwnProperty(course.course_id),
      };
    });

    return { statusCode: 200, body: JSON.stringify({ courses: formattedCourses, userProgress }) };
  } catch (error) {
    return handleError(error, 'getCourses');
  }
};
