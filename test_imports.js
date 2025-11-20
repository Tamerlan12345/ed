try {
  const execa = require('execa');
  console.log('execa loaded');
} catch (e) {
  console.error('execa failed:', e.message);
}

try {
  const { fromPath } = require('pdf2pic');
  console.log('pdf2pic loaded');
} catch (e) {
  console.error('pdf2pic failed:', e.message);
}
