// Configuration management for Terabox credentials
// Prioritizes environment variables, then falls back to defaults

const TERABOX_EMAIL = process.env.TERABOX_EMAIL || 'seeulivee@gmail.com';
const TERABOX_PASSWORD = process.env.TERABOX_PASSWORD || 'golivesid';

// Export the configuration
module.exports = {
  TERABOX_EMAIL,
  TERABOX_PASSWORD
};
