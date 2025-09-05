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
    if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
    }
    const userDepartment = profile ? profile.department : null;

    // 2. Get all published courses
    const { data: publishedCourses, error: coursesError } = await supabase
      .from('courses')
      .select('course_id, title')
      .eq('status', 'published');
    if (coursesError) throw coursesError;

    // 3. Get group assignments for the user's department to find assigned courses and their dates
    const assignedCourseDetails = new Map();
    if (userDepartment) {
      const { data: assignedGroups, error: assignmentError } = await supabase
        .from('group_assignments')
        .select('course_groups ( start_date, recurrence_period, course_group_items(course_id) )')
        .eq('department', userDepartment);

      if (assignmentError) throw assignmentError;

      assignedGroups.forEach(groupAssignment => {
        const group = groupAssignment.course_groups;
        if (!group) return;
        const details = {
          startDate: group.start_date,
          recurrence: group.recurrence_period
        };
        group.course_group_items.forEach(item => {
          assignedCourseDetails.set(item.course_id, details);
        });
      });
    }

    // 4. Get user's progress
    const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select('course_id, percentage, attempts')
        .eq('user_email', user.email);
    if (progressError) throw progressError;

    const userProgress = {};
    progressData.forEach(p => {
        userProgress[p.course_id] = { completed: p.percentage === 100, percentage: p.percentage, attempts: p.attempts };
    });

    // 5. Determine all unique assigned course IDs
    const assignedCourseIds = new Set([
      ...assignedCourseDetails.keys(),
      ...progressData.map(p => p.course_id)
    ]);

    // 6. Create a master map of all courses
    const allCoursesMap = new Map();
    publishedCourses.forEach(c => allCoursesMap.set(c.course_id, c));

    const missingCourseIds = Array.from(assignedCourseIds).filter(id => !allCoursesMap.has(id));
    if (missingCourseIds.length > 0) {
        const { data: missingCourses, error: missingCoursesError } = await supabase
            .from('courses')
            .select('course_id, title')
            .in('course_id', missingCourseIds);
        if (missingCoursesError) throw missingCoursesError;
        missingCourses.forEach(c => allCoursesMap.set(c.course_id, c));
    }
    
    // 7. Format final course list, adding assignment data
    const courses = Array.from(allCoursesMap.values()).map(course => {
      const assignmentDetails = assignedCourseDetails.get(course.course_id);
      return {
        id: course.course_id,
        title: course.title,
        isAssigned: assignedCourseIds.has(course.course_id),
        startDate: assignmentDetails?.startDate,
        recurrence: assignmentDetails?.recurrence
      };
    });

    return { statusCode: 200, body: JSON.stringify({ courses, userProgress }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
