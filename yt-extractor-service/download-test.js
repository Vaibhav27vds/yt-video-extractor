// download-test.js
const youtubedl = require('youtube-dl-exec');

(async () => {
  try {
    await youtubedl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      output: 'tmp/test.%(ext)s',
      format: 'bestaudio',
      noPlaylist: true,
      quiet: false
    });
    console.log('download finished');
  } catch (err) {
    console.error('download error:', err);
    process.exit(1);
  }
})();