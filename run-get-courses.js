const getCourses = require('./netlify/functions/getCourses.js');

process.env.SUPABASE_URL = "https://wnsdlibhrlmgyszbyxat.supabase.co";
process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Induc2RsaWJocmxtZ3lzemJ5eGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyODE0MjgsImV4cCI6MjA2OTg1NzQyOH0.Sgz-50dHj8M599sIjTRYs0kMP7b6kX2BJ-Gc-trMUQ4";

async function runTest() {
  const event = {
    headers: {
      authorization: 'Bearer FAKE_TOKEN'
    }
  };
  const response = await getCourses.handler(event);
  console.log(response);
}

runTest();
