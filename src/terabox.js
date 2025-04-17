const axios = require('axios');
const { URL, URLSearchParams } = require('url');
const path = require('path');
const { getReadableFileSize } = require('./utils');
const { loginAndGetCookies } = require('./auth');

/**
 * Get links from Terabox URL
 * @param {string} url - Terabox share URL
 * @param {string} email - Terabox email
 * @param {string} password - Terabox password
 * @returns {Promise<Object>} - File details and links
 */
async function getLinks(url, email, password) {
  try {
    // Create session with cookies
    const cookies = await loginAndGetCookies(email, password);
    
    // Convert cookie object to Cookie header string
    const cookieString = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookieString
    };
    
    // First request to get jsToken
    const initialResponse = await axios.get(url, { 
      headers,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 500
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
      timeout: 30000 // 30s timeout for large folders
    });
    
    const data = listResponse.data;
    if (data.errno !== 0) {
      return { 
        status: 'error', 
        message: data.errmsg || 'Unknown error' 
      };
    }
    
    let totalSize = 0;
    const files = [];
    
    // Recursive function to fetch all files
    async function fetchFiles(contents, folder = '') {
      for (const item of contents) {
        if (item.isdir === 1) {
          // Handle directory
          const fetchSubParams = { ...params, dir: item.path };
          const fetchSubResponse = await axios.get('https://www.1024tera.com/share/list', {
            headers,
            params: fetchSubParams
          });
          
          await fetchFiles(
            fetchSubResponse.data.list || [], 
            path.join(folder, item.server_filename)
          );
        } else {
          // Handle file
          const size = item.size || 0;
          totalSize += size;
          
          files.push({
            filename: item.server_filename,
            path: folder,
            size: getReadableFileSize(size),
            url: item.dlink
          });
        }
      }
    }
    
    await fetchFiles(data.list || []);
    
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
