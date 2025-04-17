const axios = require('axios');

/**
 * Login to Terabox and get cookies
 * @param {string} email - Terabox email
 * @param {string} password - Terabox password
 * @returns {Promise<Object>} - Session cookies
 */
async function loginAndGetCookies(email, password) {
  const session = axios.create();
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  
  const data = new URLSearchParams();
  data.append('login_email', email);
  data.append('login_pwd', password);
  data.append('login_type', '1');
  
  try {
    const response = await session.post('https://www.1024tera.com/api/user/login', data, { 
      headers,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 500
    });
    
    if (response.status === 200) {
      // Extract cookies from response
      const cookies = {};
      const setCookieHeader = response.headers['set-cookie'];
      
      if (setCookieHeader) {
        setCookieHeader.forEach(cookie => {
          const parts = cookie.split(';')[0].split('=');
          if (parts.length === 2) {
            cookies[parts[0]] = parts[1];
          }
        });
      }
      
      if (cookies.ndus) {
        return cookies;
      }
    }
    
    throw new Error('Login failed: check credentials or response format.');
  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
}

module.exports = { loginAndGetCookies };
