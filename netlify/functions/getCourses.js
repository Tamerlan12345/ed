const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
  try {
    const token = event.headers.authorization.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // 1. Get user's department from their profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('department')
      .eq('id', user.id)
      .single();
    // A missing profile is not a fatal error, they might not have a department
    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = 'single row not found'
        throw profileError;
    }
    const userDepartment = profile ? profile.department : null;

    // 2. Get all published courses (for the catalog)
    const { data: publishedCourses, error: coursesError } = await supabase
      .from('courses')
      .select('course_id, title, product_line')
      .eq('status', 'published');
    if (coursesError) throw coursesError;

    let assignedCourseIds = new Set();
    // 3. If user has a department, get courses assigned to that department
    if (userDepartment) {
      const { data: assignedGroups, error: assignmentError } = await supabase
        .from('group_assignments')
        .select('course_groups(course_group_items(course_id))')
        .eq('department', userDepartment);

      if (assignmentError) throw assignmentError;

      assignedGroups.forEach(groupAssignment => {
        groupAssignment.course_groups.course_group_items.forEach(item => {
          assignedCourseIds.add(item.course_id);
        });
      });
    }

    // 4. Get user's progress to find courses they are already enrolled in
    const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select('course_id, percentage, attempts')
        .eq('user_email', user.email);
    if (progressError) throw progressError;

    let userProgress = {};
    progressData.forEach(p => {
        userProgress[p.course_id] = { completed: p.percentage === 100, percentage: p.percentage, attempts: p.attempts };
        assignedCourseIds.add(p.course_id); // Also consider courses with progress as "assigned"
    });

    // 5. Combine and de-duplicate all courses
    const allCoursesMap = new Map();
    publishedCourses.forEach(c => allCoursesMap.set(c.course_id, c));

    // Ensure assigned courses are in the map, even if not "published" (special access)
    // This part requires fetching their details if they aren't already in the published list
    const missingCourseIds = Array.from(assignedCourseIds).filter(id => !allCoursesMap.has(id));
    if (missingCourseIds.length > 0) {
        const { data: missingCourses, error: missingCoursesError } = await supabase
            .from('courses')
            .select('course_id, title')
            .in('course_id', missingCourseIds);
        if (missingCoursesError) throw missingCoursesError;
        missingCourses.forEach(c => allCoursesMap.set(c.course_id, c));
    }
    
    const courses = Array.from(allCoursesMap.values()).map(course => ({
        id: course.course_id,
        title: course.title,
        product_line: course.product_line,
        // We can add a flag to distinguish assigned vs catalog courses on the frontend
        isAssigned: assignedCourseIds.has(course.course_id)
    }));

    return { statusCode: 200, body: JSON.stringify({ courses, userProgress }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
