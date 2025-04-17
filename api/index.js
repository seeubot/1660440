const express = require('express');
const serverless = require('serverless-http');
const { getLinks } = require('../src/terabox');
const { TERABOX_EMAIL, TERABOX_PASSWORD } = require('../src/config');

const app = express();

// Middleware to handle CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Route to fetch Terabox links
app.get('/api', async (req, res) => {
  const { link } = req.query;
  
  if (!link) {
    return res.status(400).json({ status: 'error', message: 'No link provided' });
  }
  
  try {
    const result = await getLinks(link, TERABOX_EMAIL, TERABOX_PASSWORD);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ 
      status: 'error', 
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Default route
app.get('/', (req, res) => {
  res.send('Terabox API Server is running. Use /api?link=YOUR_TERABOX_URL endpoint.');
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for serverless
module.exports = serverless(app);
