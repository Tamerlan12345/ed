const { extractTextFromPptx } = require('./server/services/pptxParser');
const fs = require('fs');

// Simple test mock since we don't want to bring in a real PPTX file here
// We can test if the function is exported and async
async function test() {
    console.log('Testing extractTextFromPptx...');
    if (typeof extractTextFromPptx !== 'function') {
        throw new Error('extractTextFromPptx is not a function');
    }
    console.log('extractTextFromPptx is a function.');
    console.log('Test passed (basic existence check). Full integration test requires a real .pptx buffer.');
}

test().catch(e => {
    console.error(e);
    process.exit(1);
});
