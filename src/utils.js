/**
 * Convert bytes to human-readable file size
 * @param {number} bytes - Size in bytes
 * @returns {string} - Human-readable file size
 */
function getReadableFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { getReadableFileSize };
