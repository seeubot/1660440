const axios = require('axios');
const { URL, URLSearchParams } = require('url');
const path = require('path');
const { getReadableFileSize } = require('./utils');
const { loginAndGetCookies } = require('./auth');

// Cache for storing login cookies to avoid repeated logins
const cookieCache = {
  cookies: null,
  timestamp: 0,
  expiresIn: 3600000 // 1 hour in milliseconds
};

/**
 * Get links from Terabox URL with timeout optimization
 * @param {string} url - Terabox share URL
 * @param {string} email - Terabox email
 * @param {string} password - Terabox password
 * @returns {Promise<Object>} - File details and links
 */
async function getLinks(url, email, password) {
  try {
    // Set shorter timeouts for all requests
    const axiosConfig = {
      timeout: 8000, // 8 seconds timeout (Vercel has 10s limit on hobby plan)
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 500
    };
    
    // Use cached cookies if available and not expired
    if (!cookieCache.cookies || Date.now() - cookieCache.timestamp > cookieCache.expiresIn) {
      cookieCache.cookies = await loginAndGetCookies(email, password);
      cookieCache.timestamp = Date.now();
    }
    
    // Convert cookie object to Cookie header string
    const cookieString = Object.entries(cookieCache.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookieString
    };
    
    // First request to get jsToken
    const initialResponse = await axios.get(url, { 
      headers,
      ...axiosConfig
    });
    
    // Extract jsToken using regex
    const jsTokenMatch = initialResponse.data.match(/window\.jsToken.*?%22(.*?)%22/);
    if (!jsTokenMatch) {
      return { status: 'error', message: 'jsToken not found' };
    }
    const jsToken = jsTokenMatch[1];
    
    // Parse the redirected URL to get shorturl
    let shortUrl = '';
    try {
      // Handle case where responseUrl might be different in different axios versions
      const finalUrl = initialResponse.request.res.responseUrl || initialResponse.request.responseURL;
      const urlObj = new URL(finalUrl);
      shortUrl = new URLSearchParams(urlObj.search).get('surl') || '';
    } catch (error) {
      // Fallback method for extracting shorturl from HTML
      const shortUrlMatch = initialResponse.data.match(/shorturl\s*=\s*['"]([^'"]+)['"]/);
      if (shortUrlMatch) {
        shortUrl = shortUrlMatch[1];
      } else {
        return { status: 'error', message: 'Failed to extract shorturl' };
      }
    }
    
    // Set up parameters for list request
    const params = {
      app_id: '250528',
      jsToken: jsToken,
      shorturl: shortUrl
    };
    
    // Get file list
    const listResponse = await axios.get('https://www.1024tera.com/share/list', {
      headers,
      params,
      ...axiosConfig
    });
    
    const data = listResponse.data;
    if (data.errno !== 0) {
      return { 
        status: 'error', 
        message: data.errmsg || 'Unknown error' 
      };
    }
    
    // Return top-level files only to avoid timeouts
    // Don't recursively fetch directory contents
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
        // Just note that there's a directory but don't fetch its contents
        files.push({
          filename: item.server_filename,
          path: '',
          size: 'Directory',
          url: null,
          isdir: true,
          dir_path: item.path
        });
      }
    }
    
    return {
      status: 'success',
      total_size: getReadableFileSize(totalSize),
      file_count: files.length,
      files: files
    };
    
  } catch (error) {
    console.error('Error fetching Terabox links:', error);
    return { 
      status: 'error', 
      message: error.message || 'Unknown error'
    };
  }
}

module.exports = { getLinks };
