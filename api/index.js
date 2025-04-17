const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');
const { URL, URLSearchParams } = require('url');
const { getReadableFileSize } = require('../src/utils');
const { loginAndGetCookies } = require('../src/auth');
const { TERABOX_EMAIL, TERABOX_PASSWORD } = require('../src/config');

const app = express();

// Middleware to handle CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Cookie cache
const cookieCache = {
  cookies: null,
  timestamp: 0,
  expiresIn: 3600000 // 1 hour
};

// Step 1: Initial link parsing and top-level directory listing
app.get('/api', async (req, res) => {
  const { link } = req.query;
  
  if (!link) {
    return res.status(400).json({ status: 'error', message: 'No link provided' });
  }
  
  try {
    // Get cached or fresh cookies
    if (!cookieCache.cookies || Date.now() - cookieCache.timestamp > cookieCache.expiresIn) {
      cookieCache.cookies = await loginAndGetCookies(TERABOX_EMAIL, TERABOX_PASSWORD);
      cookieCache.timestamp = Date.now();
    }
    
    const cookieString = Object.entries(cookieCache.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookieString
    };
    
    // First request to get jsToken
    const initialResponse = await axios.get(link, { 
      headers,
      timeout: 8000
    });
    
    // Extract jsToken
    const jsTokenMatch = initialResponse.data.match(/window\.jsToken.*?%22(.*?)%22/);
    if (!jsTokenMatch) {
      return res.status(400).json({ status: 'error', message: 'jsToken not found' });
    }
    const jsToken = jsTokenMatch[1];
    
    // Get shortUrl
    let shortUrl = '';
    try {
      const finalUrl = initialResponse.request.res.responseUrl || initialResponse.request.responseURL;
      const urlObj = new URL(finalUrl);
      shortUrl = new URLSearchParams(urlObj.search).get('surl') || '';
    } catch (error) {
      const shortUrlMatch = initialResponse.data.match(/shorturl\s*=\s*['"]([^'"]+)['"]/);
      if (shortUrlMatch) {
        shortUrl = shortUrlMatch[1];
      } else {
        return res.status(400).json({ status: 'error', message: 'Failed to extract shorturl' });
      }
    }
    
    // Set up parameters for list request
    const params = {
      app_id: '250528',
      jsToken: jsToken,
      shorturl: shortUrl
    };
    
    // Get file list (top level only)
    const listResponse = await axios.get('https://www.1024tera.com/share/list', {
      headers,
      params,
      timeout: 8000
    });
    
    const data = listResponse.data;
    if (data.errno !== 0) {
      return res.status(400).json({ 
        status: 'error',
        message: data.errmsg || 'Unknown error' 
      });
    }
    
    // Process top-level items
    let totalSize = 0;
    const files = [];
    
    for (const item of data.list || []) {
      if (item.isdir === 0) {
        // Only process files, skip directories
        const size = item.size || 0;
        totalSize += size;
        
        files.push({
          filename: item.server_filename,
          path: '',
          size: getReadableFileSize(size),
          url: item.dlink,
          isdir: false
        });
      } else {
        // Just note that there's a directory
        files.push({
          filename: item.server_filename,
          path: '',
          size: 'Directory',
          isdir: true,
          dir_path: item.path,
          // Add link to fetch this directory separately
          fetch_url: `/api/directory?path=${encodeURIComponent(item.path)}&jsToken=${jsToken}&shorturl=${shortUrl}`
        });
      }
    }
    
    return res.json({
      status: 'success',
      total_size: getReadableFileSize(totalSize),
      file_count: files.length,
      files: files,
      // Add these tokens for subsequent requests
      _meta: {
        jsToken,
        shorturl: shortUrl
      }
    });
    
  } catch (error) {
    console.error('Error fetching Terabox links:', error);
    return res.status(500).json({ 
      status: 'error', 
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// Step 2: Fetch directory contents separately
app.get('/api/directory', async (req, res) => {
  const { path, jsToken, shorturl } = req.query;
  
  if (!path || !jsToken || !shorturl) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Missing required parameters: path, jsToken, shorturl' 
    });
  }
  
  try {
    // Use cached or fresh cookies
    if (!cookieCache.cookies || Date.now() - cookieCache.timestamp > cookieCache.expiresIn) {
      cookieCache.cookies = await loginAndGetCookies(TERABOX_EMAIL, TERABOX_PASSWORD);
      cookieCache.timestamp = Date.now();
    }
    
    const cookieString = Object.entries(cookieCache.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookieString
    };
    
    // Set up parameters for list request
    const params = {
      app_id: '250528',
      jsToken: jsToken,
      shorturl: shorturl,
      dir: path
    };
    
    // Get directory contents
    const directoryResponse = await axios.get('https://www.1024tera.com/share/list', {
      headers,
      params,
      timeout: 8000
    });
    
    const data = directoryResponse.data;
    if (data.errno !== 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: data.errmsg || 'Unknown error' 
      });
    }
    
    // Process directory items
    let totalSize = 0;
    const files = [];
    
    for (const item of data.list || []) {
      if (item.isdir === 0) {
        // Process files
        const size = item.size || 0;
        totalSize += size;
        
        files.push({
          filename: item.server_filename,
          path: path,
          size: getReadableFileSize(size),
          url: item.dlink,
          isdir: false
        });
      } else {
        // Note nested directories
        files.push({
          filename: item.server_filename,
          path: path,
          size: 'Directory',
          isdir: true,
          dir_path: item.path,
          // Add link to fetch this directory separately
          fetch_url: `/api/directory?path=${encodeURIComponent(item.path)}&jsToken=${jsToken}&shorturl=${shorturl}`
        });
      }
    }
    
    return res.json({
      status: 'success',
      directory: path,
      total_size: getReadableFileSize(totalSize),
      file_count: files.length,
      files: files
    });
    
  } catch (error) {
    console.error('Error fetching directory contents:', error);
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
