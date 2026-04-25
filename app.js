// ===== FIREBASE CONFIGURATION =====
const firebaseConfig = {
  apiKey: "AIzaSyBHnae2lJXPoaGwD3yC4f0AOTo0osOE00w",
  authDomain: "power-81d5e.firebaseapp.com",
  databaseURL: "https://power-81d5e-default-rtdb.firebaseio.com",
  projectId: "power-81d5e",
  storageBucket: "power-81d5e.firebasestorage.app",
  messagingSenderId: "1012873005832",
  appId: "1:1012873005832:web:596e4fc5232f84d6f93abd"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// ===== CONSTANTS =====
const DB_USAGE_PATH = '/usage/token_usage_v2';
const DB_HISTORY_PATH = '/history';
const DB_PAYMENTS_PATH = '/payments';
const INITIAL_FREE_TOKENS = 200;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OCR_API_URL = 'https://api.ocr.space/parse/image';

// Bank details for verification
const BANK_DETAILS = {
  bankName: 'OPAY',
  accountNumber: '9115848045',
  accountName: 'DANIEL OLANREWAJU'
};

// Token plans
const TOKEN_PLANS = {
  '500': { tokens: 1100, amount: 500 },
  '1000': { tokens: 1500, amount: 1000 }
};

// ===== STATE VARIABLES =====
let apiKey = null;
let todayTokensUsed = 0;
let currentDate = new Date().toISOString().slice(0, 10);
let currentUser = null;
let userTokens = INITIAL_FREE_TOKENS;
let totalTokensPurchased = 0;
let conversationHistory = [];
let lastAssistantReply = "";
let isSignup = false;
let selectedPlan = null;
let receiptFile = null;

// ===== DOM ELEMENTS =====
const welcomeScreen = document.getElementById('welcomeScreen');
const authScreen = document.getElementById('authScreen');
const mainApp = document.getElementById('mainApp');
const messagesArea = document.getElementById('messagesArea');
const chatEmpty = document.getElementById('chatEmpty');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const tokenMini = document.getElementById('tokenMini');
const tokenFooter = document.getElementById('tokenFooter');
const sidebarHistory = document.getElementById('sidebarHistory');
const tokenModal = document.getElementById('tokenModal');
const subscribeBtn = document.getElementById('subscribeBtn');
const floatingSubscribeBtn = document.getElementById('floatingSubscribeBtn');
const bannerSubscribeBtn = document.getElementById('bannerSubscribeBtn');
const lowTokenBanner = document.getElementById('lowTokenBanner');

// ===== DATE UTILITY FUNCTIONS =====
function getCurrentDate() {
  const now = new Date();
  return {
    full: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    formatted: now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    formattedNigeria: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  };
}

function getDateRangeForVerification() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return {
    today: today,
    yesterday: yesterday,
    tomorrow: tomorrow,
    todayFormatted: formatDate(today),
    yesterdayFormatted: formatDate(yesterday),
    tomorrowFormatted: formatDate(tomorrow)
  };
}

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateAlternative(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}

// ===== AUTH FUNCTIONS =====
function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.innerText = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

function toggleAuthMode() {
  isSignup = !isSignup;
  document.getElementById('loginForm').style.display = isSignup ? 'none' : 'block';
  document.getElementById('signupForm').style.display = isSignup ? 'block' : 'none';
  document.getElementById('authTitle').innerText = isSignup ? 'Create Account' : 'Welcome back';
  document.getElementById('toggleAuthMode').innerText = isSignup ? 'Login instead' : 'Create an account';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  if (!email || !pass) return showAuthError('Fill all fields');
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    showAuthError(e.message);
  }
}

async function handleSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const pass = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;
  
  if (!name || !email || !pass) return showAuthError('All fields required');
  if (pass !== confirm) return showAuthError('Passwords do not match');
  
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    await initializeUserData(cred.user.uid);
  } catch (e) {
    showAuthError(e.message);
  }
}

// ===== USER DATA INITIALIZATION =====
async function initializeUserData(uid) {
  const userRef = database.ref(`/users/${uid}`);
  const snap = await userRef.once('value');
  if (!snap.exists()) {
    await userRef.set({
      tokens: INITIAL_FREE_TOKENS,
      totalTokensPurchased: 0,
      createdAt: new Date().toISOString()
    });
  }
}

async function loadUserData() {
  if (!currentUser) return;
  
  const userRef = database.ref(`/users/${currentUser.uid}`);
  const snap = await userRef.once('value');
  const data = snap.val();
  
  if (data) {
    userTokens = data.tokens || INITIAL_FREE_TOKENS;
    totalTokensPurchased = data.totalTokensPurchased || 0;
  } else {
    userTokens = INITIAL_FREE_TOKENS;
    totalTokensPurchased = 0;
    await initializeUserData(currentUser.uid);
  }
  
  updateTokenUI();
}

async function updateUserTokens(newTokens) {
  userTokens = newTokens;
  await database.ref(`/users/${currentUser.uid}`).update({
    tokens: userTokens,
    totalTokensPurchased: totalTokensPurchased
  });
  updateTokenUI();
}

// ===== TOKEN MANAGEMENT =====
function updateTokenUI() {
  const remaining = userTokens;
  tokenMini.innerText = remaining;
  tokenFooter.innerText = `${remaining} tokens remaining`;
  
  tokenMini.classList.remove('low');
  
  // Show/hide low token warning
  if (remaining <= 50 && remaining > 0) {
    tokenMini.classList.add('low');
    lowTokenBanner.classList.add('show');
    while (lowTokenBanner.firstChild && lowTokenBanner.firstChild !== bannerSubscribeBtn) {
      lowTokenBanner.removeChild(lowTokenBanner.firstChild);
    }
    const textSpan = document.createElement('span');
    textSpan.innerText = `⚠️ Only ${remaining} tokens left! `;
    lowTokenBanner.insertBefore(textSpan, bannerSubscribeBtn);
  } else if (remaining <= 0) {
    tokenMini.classList.add('low');
    lowTokenBanner.classList.add('show');
    while (lowTokenBanner.firstChild && lowTokenBanner.firstChild !== bannerSubscribeBtn) {
      lowTokenBanner.removeChild(lowTokenBanner.firstChild);
    }
    const textSpan = document.createElement('span');
    textSpan.innerText = '⚠️ You have 0 tokens! ';
    lowTokenBanner.insertBefore(textSpan, bannerSubscribeBtn);
  } else {
    lowTokenBanner.classList.remove('show');
  }
  
  // Show/hide floating subscribe button
  if (floatingSubscribeBtn) {
    if (remaining <= 100 && window.innerWidth <= 768) {
      floatingSubscribeBtn.style.display = 'block';
    } else {
      floatingSubscribeBtn.style.display = 'none';
    }
  }
}

function useTokens(count) {
  if (userTokens >= count) {
    userTokens -= count;
    database.ref(`/users/${currentUser.uid}`).update({ tokens: userTokens });
    updateTokenUI();
    return true;
  }
  return false;
}

function addTokens(count) {
  userTokens += count;
  totalTokensPurchased += count;
  database.ref(`/users/${currentUser.uid}`).update({
    tokens: userTokens,
    totalTokensPurchased: totalTokensPurchased
  });
  updateTokenUI();
}

function estimateTokens(text) {
  return Math.ceil(text.split(/\s+/).length * 1.1) + 3;
}

// ===== API KEY MANAGEMENT =====
database.ref('/api_keys/aiKey').on('value', snap => {
  const val = snap.val();
  apiKey = (val && val.startsWith('gsk_')) ? val : null;
});

// ===== CHAT FUNCTIONS =====
async function callGroqAPI(msg) {
  if (!apiKey) throw new Error('API key missing');
  
  const estimatedCost = estimateTokens(msg) + 50;
  if (userTokens < estimatedCost) {
    throw new Error('INSUFFICIENT_TOKENS');
  }

  const messages = [
    {
      role: "system",
      content: "You are ELren, a neon galaxy AI. Keep replies under 150 tokens, engaging and helpful."
    },
    ...conversationHistory.slice(-6),
    { role: "user", content: msg.slice(0, 300) }
  ];

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.6,
      max_tokens: 150
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'API error');
  }
  
  const data = await res.json();
  let reply = data.choices[0].message.content;
  
  const actualCost = estimateTokens(msg) + estimateTokens(reply);
  useTokens(actualCost);
  
  conversationHistory.push(
    { role: 'user', content: msg },
    { role: 'assistant', content: reply }
  );
  
  return reply;
}

function addMessage(role, text) {
  chatEmpty.style.display = 'none';
  messagesArea.style.display = 'block';
  
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<div class="message-bubble">${text.replace(/\n/g, '<br>')}</div>`;
  messagesArea.appendChild(div);
  
  document.getElementById('chatContainer').scrollTop = document.getElementById('chatContainer').scrollHeight;
  return div;
}

function addTyping() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'typingMsg';
  div.innerHTML = `<div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  messagesArea.appendChild(div);
  document.getElementById('chatContainer').scrollTop = document.getElementById('chatContainer').scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typingMsg');
  if (el) el.remove();
}

async function sendMessage(text) {
  if (!text.trim()) return;
  
  if (userTokens <= 0) {
    addMessage('assistant', '⚠️ You have 0 tokens remaining! Please purchase more tokens to continue. Use the Subscribe button or tap the token badge.');
    openTokenModal();
    return;
  }
  
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  addMessage('user', text);
  addTyping();
  sendBtn.disabled = true;
  
  try {
    const reply = await callGroqAPI(text);
    removeTyping();
    addMessage('assistant', reply);
    lastAssistantReply = reply;
    
    await saveToHistory(text, reply);
  } catch (e) {
    removeTyping();
    if (e.message === 'INSUFFICIENT_TOKENS') {
      addMessage('assistant', '⚠️ Insufficient tokens! You need more tokens to continue. Please purchase tokens.');
      openTokenModal();
    } else if (e.message.includes('API key missing')) {
      addMessage('assistant', 'API configuration error. Please contact support.');
    } else {
      addMessage('assistant', `Error: ${e.message.slice(0, 100)}`);
    }
  } finally {
    sendBtn.disabled = false;
  }
}

// ===== SPEECH SYNTHESIS =====
function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }
}

// ===== TOKEN PURCHASE & VERIFICATION =====
function openTokenModal() {
  tokenModal.classList.add('active');
  resetPaymentForm();
}

function closeTokenModal() {
  tokenModal.classList.remove('active');
  resetPaymentForm();
}

function resetPaymentForm() {
  selectedPlan = null;
  receiptFile = null;
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('amountToPay').innerText = '₦0';
  document.getElementById('submitPayment').disabled = true;
  document.getElementById('verificationStatus').style.display = 'none';
  document.getElementById('uploadArea').style.borderColor = 'var(--neon-gold)';
  document.getElementById('uploadArea').querySelector('p').innerText = '📸 Click to upload payment receipt';
}

function selectPlan(planKey) {
  selectedPlan = planKey;
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`[data-plan="${planKey}"]`).classList.add('selected');
  
  const plan = TOKEN_PLANS[planKey];
  document.getElementById('amountToPay').innerText = `₦${plan.amount.toLocaleString()}`;
  document.getElementById('submitPayment').disabled = !receiptFile;
}

// ===== DATE EXTRACTION FROM RECEIPT =====
function extractDatesFromText(text) {
  const dates = [];
  
  // Common date patterns in Nigerian bank receipts
  const datePatterns = [
    // DD/MM/YYYY or DD-MM-YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g,
    // YYYY-MM-DD or YYYY/MM/DD
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g,
    // DD Mon YYYY (e.g., 15 Jan 2024)
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/gi,
    // Mon DD, YYYY (e.g., Jan 15, 2024)
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/gi,
    // DD Month YYYY (e.g., 15 January 2024)
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi
  ];
  
  const monthMap = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
  };
  
  // Try DD/MM/YYYY pattern
  let match;
  const ddmmPattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  while ((match = ddmmPattern.exec(text)) !== null) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month - 1, day),
        formatted: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        source: match[0]
      });
    }
  }
  
  // Try YYYY-MM-DD pattern
  const yyyymmPattern = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g;
  while ((match = yyyymmPattern.exec(text)) !== null) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const day = parseInt(match[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month - 1, day),
        formatted: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        source: match[0]
      });
    }
  }
  
  // Try DD Mon YYYY pattern
  const ddMonPattern = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/gi;
  while ((match = ddMonPattern.exec(text)) !== null) {
    const day = parseInt(match[1]);
    const month = monthMap[match[2].toLowerCase()];
    const year = parseInt(match[3]);
    if (day >= 1 && day <= 31 && month && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month - 1, day),
        formatted: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        source: match[0]
      });
    }
  }
  
  // Try Mon DD, YYYY pattern
  const monDdPattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/gi;
  while ((match = monDdPattern.exec(text)) !== null) {
    const month = monthMap[match[1].toLowerCase()];
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);
    if (day >= 1 && day <= 31 && month && year >= 2020 && year <= 2030) {
      dates.push({
        date: new Date(year, month - 1, day),
        formatted: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        source: match[0]
      });
    }
  }
  
  // Remove duplicates by formatted date
  const uniqueDates = [];
  const seenFormatted = new Set();
  for (const d of dates) {
    if (!seenFormatted.has(d.formatted)) {
      seenFormatted.add(d.formatted);
      uniqueDates.push(d);
    }
  }
  
  return uniqueDates;
}

function verifyReceiptDate(extractedDates) {
  const currentDate = getCurrentDate();
  const dateRange = getDateRangeForVerification();
  
  if (extractedDates.length === 0) {
    return {
      isValid: false,
      message: 'No date found on receipt. Please ensure the receipt shows the transaction date.',
      details: {
        hasDate: false,
        isWithinRange: false,
        foundDates: [],
        expectedDates: [dateRange.todayFormatted, dateRange.yesterdayFormatted]
      }
    };
  }
  
  // Check if any extracted date matches today or yesterday
  const matchingDates = [];
  const todayTime = dateRange.today.getTime();
  const yesterdayTime = dateRange.yesterday.getTime();
  const tomorrowTime = dateRange.tomorrow.getTime();
  
  for (const extractedDate of extractedDates) {
    const extractedTime = extractedDate.date.getTime();
    
    // Allow today or yesterday (give 24 hour grace period)
    if (extractedTime === todayTime || extractedTime === yesterdayTime) {
      matchingDates.push({
        ...extractedDate,
        matchType: extractedTime === todayTime ? 'Today' : 'Yesterday'
      });
    }
    
    // Allow within 24 hours
    const diffTime = Math.abs(currentDate.full - extractedTime);
    const diffHours = diffTime / (1000 * 60 * 60);
    if (diffHours <= 24 && !matchingDates.find(d => d.formatted === extractedDate.formatted)) {
      matchingDates.push({
        ...extractedDate,
        matchType: 'Within 24 hours'
      });
    }
  }
  
  const isValid = matchingDates.length > 0;
  
  return {
    isValid: isValid,
    message: isValid 
      ? `✅ Receipt date verified: ${matchingDates[0].formatted} (${matchingDates[0].matchType})`
      : `❌ Receipt date mismatch. Found: ${extractedDates.map(d => d.formatted).join(', ')}. Expected: Today (${dateRange.todayFormatted}) or Yesterday (${dateRange.yesterdayFormatted})`,
    details: {
      hasDate: true,
      isWithinRange: isValid,
      foundDates: extractedDates.map(d => d.formatted),
      matchingDates: matchingDates.map(d => d.formatted),
      expectedDates: [dateRange.todayFormatted, dateRange.yesterdayFormatted],
      currentDate: dateRange.todayFormatted
    }
  };
}

// ===== AI RECEIPT VERIFICATION =====
async function verifyReceiptWithOCR(imageFile) {
  const formData = new FormData();
  formData.append('file', imageFile);
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'false');
  formData.append('apikey', 'helloworld');
  formData.append('OCREngine', '2');

  try {
    const response = await fetch(OCR_API_URL, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.IsErroredOnProcessing) {
      return { 
        success: false, 
        message: 'Could not read the receipt image. Please ensure it is clear and try again.', 
        extractedText: '',
        verificationDetails: null
      };
    }
    
    const parsedResults = result.ParsedResults || [];
    let extractedText = '';
    
    if (parsedResults.length > 0) {
      extractedText = parsedResults[0].ParsedText || '';
    }
    
    console.log('OCR Extracted Text:', extractedText);
    
    // Analyze receipt text for all verification points
    const verificationResult = analyzeReceiptText(extractedText);
    
    // Extract and verify dates
    const extractedDates = extractDatesFromText(extractedText);
    const dateVerification = verifyReceiptDate(extractedDates);
    
    // Combine results
    const overallSuccess = verificationResult.isValid && dateVerification.isValid;
    
    let combinedMessage = '';
    if (overallSuccess) {
      combinedMessage = '✅ All verifications passed! ';
      if (verificationResult.isValid) combinedMessage += 'Payment details confirmed. ';
      if (dateVerification.isValid) combinedMessage += dateVerification.message;
    } else {
      combinedMessage = '❌ Verification failed:\n';
      if (!verificationResult.isValid) combinedMessage += verificationResult.message + '\n';
      if (!dateVerification.isValid) combinedMessage += dateVerification.message;
    }
    
    return {
      success: overallSuccess,
      message: combinedMessage,
      extractedText: extractedText,
      details: {
        paymentDetails: verificationResult.details,
        dateDetails: dateVerification.details,
        overallScore: verificationResult.details.score || 0
      }
    };
    
  } catch (error) {
    console.error('OCR Error:', error);
    return { 
      success: false, 
      message: 'Failed to process receipt. Please check your internet connection and try again.', 
      extractedText: '',
      verificationDetails: null
    };
  }
}

function analyzeReceiptText(text) {
  const upperText = text.toUpperCase();
  const details = {};
  
  // Check for bank name (OPAY)
  const hasBankName = upperText.includes('OPAY') || 
                      upperText.includes('O PAY') || 
                      upperText.includes('OPAY DIGITAL') ||
                      upperText.includes('PAYCOM');
  
  // Check for account number
  const accountNumberRegex = /9115848045|9115\s*848\s*045|9115848045/;
  const hasAccountNumber = accountNumberRegex.test(text.replace(/\s+/g, ''));
  
  // Check for account name
  const nameParts = ['DANIEL', 'OLANREWAJU'];
  const hasAccountName = nameParts.every(part => upperText.includes(part)) ||
                         upperText.includes('DANIEL OLANREWAJU') ||
                         (upperText.includes('DANIEL') && upperText.includes('OLANRE'));
  
  // Extract amount
  const amountRegex = /(?:₦|NGN|NAIRA)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
  const amounts = [];
  let match;
  while ((match = amountRegex.exec(text)) !== null) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    if (amount > 0) amounts.push(amount);
  }
  
  let expectedAmount = selectedPlan ? TOKEN_PLANS[selectedPlan].amount : null;
  let amountMatches = false;
  
  if (expectedAmount && amounts.length > 0) {
    amountMatches = amounts.some(a => a === expectedAmount || 
                                       Math.abs(a - expectedAmount) <= 1);
  }
  
  details.hasBankName = hasBankName;
  details.hasAccountNumber = hasAccountNumber;
  details.hasAccountName = hasAccountName;
  details.amountMatches = amountMatches;
  details.extractedAmounts = amounts;
  details.expectedAmount = expectedAmount;
  
  // Scoring system
  let score = 0;
  if (hasBankName) score += 20;
  if (hasAccountNumber) score += 25;
  if (hasAccountName) score += 20;
  if (amountMatches) score += 15;
  
  const isValid = score >= 50;
  
  let message = '';
  if (isValid) {
    message = '✅ Payment details verified. ';
  } else {
    const missingItems = [];
    if (!hasBankName) missingItems.push('bank name (OPAY)');
    if (!hasAccountNumber) missingItems.push('account number (9115848045)');
    if (!hasAccountName) missingItems.push('account name (DANIEL OLANREWAJU)');
    if (!amountMatches) missingItems.push(`correct amount (₦${expectedAmount})`);
    
    message = `❌ Payment details mismatch: Missing ${missingItems.join(', ')}. `;
  }
  
  details.score = score;
  return { isValid, message, details };
}

async function handlePaymentSubmission() {
  if (!selectedPlan || !receiptFile) {
    alert('Please select a plan and upload your payment receipt.');
    return;
  }
  
  const submitBtn = document.getElementById('submitPayment');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Verifying...';
  
  const statusDiv = document.getElementById('verificationStatus');
  statusDiv.style.display = 'block';
  statusDiv.className = 'verification-status pending';
  statusDiv.innerText = '🔍 AI Analyzing receipt details & date...';
  
  try {
    const verification = await verifyReceiptWithOCR(receiptFile);
    
    if (verification.success) {
      const plan = TOKEN_PLANS[selectedPlan];
      addTokens(plan.tokens);
      
      await savePaymentRecord(plan, verification);
      
      statusDiv.className = 'verification-status success';
      statusDiv.innerHTML = `
        ✅ Payment Verified Successfully!<br>
        ${plan.tokens} tokens added to your account.<br>
        <small style="opacity:0.8;">Verification Score: ${verification.details.overallScore}%</small>
      `;
      
      setTimeout(() => {
        closeTokenModal();
      }, 2500);
    } else {
      statusDiv.className = 'verification-status error';
      statusDiv.innerHTML = verification.message.replace(/\n/g, '<br>');
    }
  } catch (error) {
    statusDiv.className = 'verification-status error';
    statusDiv.innerText = 'Error processing verification. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Submit for Verification';
  }
}

async function savePaymentRecord(plan, verification) {
  if (!currentUser) return;
  
  const currentDate = getCurrentDate();
  
  const paymentRef = database.ref(`${DB_PAYMENTS_PATH}/${currentUser.uid}`).push();
  await paymentRef.set({
    plan: selectedPlan,
    tokens: plan.tokens,
    amount: plan.amount,
    timestamp: Date.now(),
    verifiedAt: currentDate.full,
    verificationDate: currentDate.date,
    verificationScore: verification.details?.overallScore || 0,
    paymentDetails: verification.details?.paymentDetails || {},
    dateDetails: verification.details?.dateDetails || {},
    extractedText: verification.extractedText?.slice(0, 500) || ''
  });
}

// ===== HISTORY MANAGEMENT =====
async function loadHistory() {
  if (!currentUser) return;
  
  const snap = await database.ref(`${DB_HISTORY_PATH}/${currentUser.uid}`).limitToLast(20).once('value');
  const data = snap.val() || {};
  const items = Object.entries(data).reverse();
  
  sidebarHistory.innerHTML = items.length ? '' : '<div style="color:var(--text-dim);padding:20px;">No history</div>';
  
  items.forEach(([key, val]) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerText = (val.query || '').slice(0, 30);
    div.addEventListener('click', () => sendMessage(val.query));
    sidebarHistory.appendChild(div);
  });
}

async function saveToHistory(query, reply) {
  if (!currentUser) return;
  
  await database.ref(`${DB_HISTORY_PATH}/${currentUser.uid}`).push({
    query,
    reply,
    time: new Date().toISOString()
  });
  
  await loadHistory();
}

// ===== FILE UPLOAD HANDLER =====
function handleFileUpload(file) {
  if (!file.type.match(/^image\/(jpeg|png|jpg)$/)) {
    alert('Please upload a valid image file (JPEG or PNG).');
    return;
  }
  
  receiptFile = file;
  document.getElementById('uploadArea').style.borderColor = 'var(--neon-cyan)';
  document.getElementById('uploadArea').querySelector('p').innerText = `📎 ${file.name}`;
  
  if (selectedPlan) {
    document.getElementById('submitPayment').disabled = false;
  }
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', () => {
  // Welcome screen
  document.getElementById('welcomeBtn').addEventListener('click', () => {
    welcomeScreen.classList.add('hidden');
    setTimeout(() => {
      welcomeScreen.style.display = 'none';
      authScreen.classList.add('active');
    }, 600);
  });

  // Auth toggle
  document.getElementById('toggleAuthMode').addEventListener('click', toggleAuthMode);

  // Login
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('loginPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Signup
  document.getElementById('signupBtn').addEventListener('click', handleSignup);
  document.getElementById('signupConfirm').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSignup();
  });

  // Auth state observer
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      authScreen.classList.remove('active');
      mainApp.style.display = 'flex';
      
      document.getElementById('userName').innerText = user.displayName || user.email.split('@')[0];
      document.getElementById('userEmail').innerText = user.email;
      document.getElementById('userAvatar').innerText = (user.displayName || user.email)[0].toUpperCase();
      document.getElementById('mobileToggle').style.display = window.innerWidth <= 768 ? 'flex' : 'none';
      
      await loadUserData();
      await loadHistory();
    } else {
      currentUser = null;
      mainApp.style.display = 'none';
      authScreen.classList.add('active');
    }
  });

  // Chat input
  document.getElementById('sendBtn').addEventListener('click', () => sendMessage(chatInput.value));
  
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatInput.value);
    }
  });

  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
  });

  // New chat
  document.getElementById('newChatBtn').addEventListener('click', () => {
    messagesArea.innerHTML = '';
    conversationHistory = [];
    chatEmpty.style.display = 'flex';
    messagesArea.style.display = 'none';
  });

  // Mobile sidebar toggle
  document.getElementById('mobileToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Example cards
  document.querySelectorAll('.example-card').forEach(c => {
    c.addEventListener('click', () => sendMessage(c.dataset.example));
  });

  // User menu (sign out)
  document.getElementById('userMenu').addEventListener('click', (e) => {
    if (e.target.closest('.token-badge') || e.target.closest('.subscribe-btn')) {
      openTokenModal();
      return;
    }
    if (confirm('Sign out?')) {
      auth.signOut();
    }
  });

  // Subscribe buttons
  subscribeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTokenModal();
  });

  tokenMini.addEventListener('click', (e) => {
    e.stopPropagation();
    openTokenModal();
  });

  floatingSubscribeBtn.addEventListener('click', () => {
    openTokenModal();
  });

  bannerSubscribeBtn.addEventListener('click', () => {
    openTokenModal();
  });

  // Token modal
  document.getElementById('closeTokenModal').addEventListener('click', closeTokenModal);
  
  document.getElementById('tokenModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('tokenModal')) {
      closeTokenModal();
    }
  });

  // Plan selection
  document.querySelectorAll('.plan-card').forEach(card => {
    card.addEventListener('click', () => {
      selectPlan(card.dataset.plan);
    });
  });

  // File upload
  document.getElementById('uploadArea').addEventListener('click', () => {
    document.getElementById('receiptUpload').click();
  });

  document.getElementById('receiptUpload').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  // Drag and drop support
  const uploadArea = document.getElementById('uploadArea');
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--neon-cyan)';
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'var(--neon-gold)';
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--neon-gold)';
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  // Submit payment
  document.getElementById('submitPayment').addEventListener('click', handlePaymentSubmission);

  // Window resize handler
  window.addEventListener('resize', () => {
    document.getElementById('mobileToggle').style.display = window.innerWidth <= 768 && currentUser ? 'flex' : 'none';
    if (window.innerWidth > 768) {
      document.getElementById('sidebar').classList.remove('open');
      floatingSubscribeBtn.style.display = 'none';
    } else if (userTokens <= 100) {
      floatingSubscribeBtn.style.display = 'block';
    }
  });
});

// Initial load
loadUserData();