(function() {
  'use strict';

  // Configuration - customize per client
  const CONFIG = {
    webhookUrl: 'https://kaielran.app.n8n.cloud/webhook/154e3fcd-43bd-4fcf-8079-4273a5f7d27e',
    companyName: 'Justice League',
    primaryColor: '#DC2626', // Law firm red
    agentName: 'Sarah',
    agentAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
    position: 'right',
    greeting: 'Hi! 👋 Were you recently injured in an accident?',
    autoOpenDelay: 3500,
    privacyNotice: 'By using this chat, you agree to our terms and privacy policy. Your conversation may be recorded for quality and training purposes.',
    collectFields: ['name', 'phone', 'email', 'accidentType', 'injurySeverity', 'state']
  };

  // State management
  let state = {
    stage: 'small', // 'small', 'medium', 'full'
    messages: [],
    collectedData: {},
    conversationId: generateId(),
    userLocation: null,
    isTyping: false,
    detectedColor: '#DC2626' // Default red
  };

  // Generate unique ID
  function generateId() {
    return 'conv_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  // 🎯 BUTTON DETECTION LOGIC - This is the magic!
  function detectButtons(messageText) {
    const text = messageText.toLowerCase();
    
    // Accident Type
    if (text.includes('what type of accident')) {
      return [
        {label: '🚗 Car Accident', value: 'auto'},
        {label: '🚚 Truck Accident', value: 'truck'},
        {label: '🏍️ Motorcycle', value: 'motorcycle'},
        {label: '🚶 Slip & Fall', value: 'slip-fall'},
        {label: '🐕 Dog Bite', value: 'dog bite'},
        {label: '🏗️ Workplace Injury', value: 'workplace'},
        {label: '🏥 Medical Malpractice', value: 'medical malpractice'},
        {label: '📦 Other', value: 'other'}
      ];
    }
    
    // Injury Severity
    if (text.includes('how serious were your injuries')) {
      return [
        {label: 'Minor - No medical treatment', value: 'minor'},
        {label: 'ER visit only', value: 'ER visit'},
        {label: 'Hospitalized', value: 'hospitalized'},
        {label: 'Ongoing treatment/therapy', value: 'ongoing treatment'},
        {label: 'Required surgery', value: 'surgery'}
      ];
    }
    
    // Treatment Status
    if (text.includes('are you still receiving medical treatment')) {
      return [
        {label: 'Yes - Still treating', value: 'currently treating'},
        {label: 'Completed treatment', value: 'completed treatment'},
        {label: "Haven't sought care yet", value: 'haven\'t sought care'},
        {label: "Didn't need treatment", value: 'didn\'t need treatment'}
      ];
    }
    
    // Fault
    if (text.includes('who was at fault')) {
      return [
        {label: 'Clearly the other party', value: 'other party'},
        {label: 'Both of us (shared fault)', value: 'shared fault'},
        {label: 'Not sure', value: 'not sure'},
        {label: 'It might have been me', value: 'my fault'}
      ];
    }
    
    // Police Report
    if (text.includes('was there a police report filed') || text.includes('police report filed')) {
      return [
        {label: 'Yes', value: 'yes'},
        {label: 'No', value: 'no'},
        {label: 'Not sure', value: 'not sure'}
      ];
    }
    
    // Witnesses
    if (text.includes('were there any witnesses')) {
      return [
        {label: 'Yes', value: 'yes'},
        {label: 'No', value: 'no'},
        {label: 'Not sure', value: 'not sure'}
      ];
    }
    
    // Client's Insurance
    if (text.includes('do you have auto insurance') || text.includes('do you have insurance')) {
      return [
        {label: 'Yes', value: 'yes'},
        {label: 'No', value: 'no'},
        {label: 'Not sure', value: 'not sure'}
      ];
    }
    
    // Other Party's Insurance
    if (text.includes('does the other party have insurance')) {
      return [
        {label: 'Yes', value: 'yes'},
        {label: 'No', value: 'no'},
        {label: 'Not sure', value: 'not sure'}
      ];
    }
    
    // Prior Attorney
    if (text.includes('have you already hired an attorney')) {
      return [
        {label: 'Yes - Already hired someone', value: 'yes'},
        {label: "No - Haven't hired anyone yet", value: 'no'}
      ];
    }
    
    // State Confirmation
    if (text.includes("you're in california") || text.includes('are you in california')) {
      return [
        {label: "Yes - I'm in California", value: 'California'},
        {label: "No - I'm in another state", value: 'other'}
      ];
    }
    
    // No buttons detected
    return null;
  }

  // Detect website's primary color
  function detectPrimaryColor() {
    if (CONFIG.primaryColor) {
      state.detectedColor = CONFIG.primaryColor;
      return;
    }

    const colorSources = [
      () => getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
      () => getComputedStyle(document.documentElement).getPropertyValue('--brand-color'),
      () => getComputedStyle(document.documentElement).getPropertyValue('--main-color'),
      () => {
        const btn = document.querySelector('button, .btn, [class*="button"]');
        if (btn) {
          const bg = getComputedStyle(btn).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        }
        return null;
      },
      () => {
        const link = document.querySelector('a');
        if (link) {
          const color = getComputedStyle(link).color;
          if (color && color !== 'rgb(0, 0, 0)') return color;
        }
        return null;
      },
      () => {
        const header = document.querySelector('header, nav, .header, .navbar');
        if (header) {
          const bg = getComputedStyle(header).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgb(255, 255, 255)') return bg;
        }
        return null;
      }
    ];

    for (const source of colorSources) {
      try {
        const color = source();
        if (color && color.trim()) {
          state.detectedColor = color.trim();
          console.log('Detected primary color:', state.detectedColor);
          return;
        }
      } catch (e) {
        // Continue to next source
      }
    }

    console.log('Using default color:', state.detectedColor);
  }

  // Detect user's state via IP geolocation
  async function detectLocation() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      state.userLocation = {
        state: data.region,
        stateCode: data.region_code,
        city: data.city,
        country: data.country_name
      };
      state.collectedData.detectedState = data.region;
    } catch (error) {
      console.log('Could not detect location:', error);
    }
  }

  function getTrafficSource() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      source: urlParams.get('utm_source') || 'direct',
      medium: urlParams.get('utm_medium') || 'none',
      campaign: urlParams.get('utm_campaign') || 'none',
      referrer: document.referrer || 'direct',
      landingPage: window.location.href
    };
  }

  // Inject styles
  function injectStyles() {
    const styles = `
      #aba-chat-widget * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      }

      /* Stage 1: Small circle launcher */
      #aba-chat-launcher {
        position: fixed;
        bottom: 20px;
        ${CONFIG.position}: 20px;
        width: 90px;
        height: 90px;
        border-radius: 60%;
        background: white;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        z-index: 999998;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        padding: 3px;
      }

      #aba-chat-launcher:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.35);
      }

      #aba-chat-launcher img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
        object-position: center 20%;
      }

      #aba-chat-launcher .notification-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        background: #ef4444;
        color: white;
        border-radius: 50%;
        width: 22px;
        height: 22px;
        font-size: 12px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: pulse 2s infinite;
        border: 2px solid white;
      }

      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.15); }
        100% { transform: scale(1); }
      }

      /* Stage 2: Medium popup with question */
      #aba-medium-popup {
        position: fixed;
        bottom: 20px;
        ${CONFIG.position}: 20px;
        width: 320px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        z-index: 999999;
        display: none;
        flex-direction: column;
        overflow: hidden;
        animation: popIn 0.4s ease;
      }

      @keyframes popIn {
        from {
          opacity: 0;
          transform: scale(0.8) translateY(20px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      #aba-medium-popup.open {
        display: flex;
      }

      .aba-medium-header {
        display: flex;
        justify-content: flex-end;
        padding: 12px 16px 0;
      }

      .aba-medium-close {
        background: none;
        border: none;
        color: #9ca3af;
        cursor: pointer;
        font-size: 20px;
        padding: 0;
        line-height: 1;
      }

      .aba-medium-close:hover {
        color: #6b7280;
      }

      .aba-medium-content {
        padding: 0 20px 20px;
        text-align: center;
      }

      .aba-medium-avatar {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        object-fit: cover;
        object-position: center 20%;
        margin-bottom: 8px;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .aba-medium-name {
        font-weight: 600;
        font-size: 16px;
        color: #374151;
        margin-bottom: 4px;
      }

      .aba-medium-time {
        font-size: 12px;
        color: #9ca3af;
        margin-bottom: 16px;
      }

      .aba-medium-message {
        background: #f3f4f6;
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 15px;
        color: #374151;
        margin-bottom: 16px;
        text-align: left;
      }

      .aba-medium-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
      }

      .aba-medium-button {
        background: white;
        border: 2px solid var(--aba-primary-color, #DC2626);
        color: var(--aba-primary-color, #DC2626);
        padding: 10px 20px;
        border-radius: 24px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .aba-medium-button:hover {
        background: var(--aba-primary-color, #DC2626);
        color: white;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .aba-medium-input {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        background: #f3f4f6;
        border-radius: 24px;
        padding: 4px 4px 4px 16px;
      }

      .aba-medium-input input {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 14px;
        outline: none;
        padding: 8px 0;
      }

      .aba-medium-input button {
        background: var(--aba-primary-color, #DC2626);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .aba-medium-input button svg {
        width: 14px;
        height: 14px;
        fill: white;
      }

      /* Stage 3: Full chat window */
      #aba-chat-window {
        position: fixed;
        bottom: 20px;
        ${CONFIG.position}: 20px;
        width: 420px;
        height: 600px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 50px rgba(0, 0, 0, 0.25);
        z-index: 999999;
        display: none;
        flex-direction: column;
        overflow: hidden;
        animation: expandIn 0.4s ease;
      }

      @keyframes expandIn {
        from {
          opacity: 0;
          transform: scale(0.9);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      #aba-chat-window.open {
        display: flex;
      }

      .aba-chat-header {
        background: white;
        color: #333;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #e5e7eb;
      }

      .aba-chat-header-title {
        font-weight: 600;
        font-size: 16px;
      }

      .aba-chat-close {
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        padding: 5px;
        font-size: 20px;
        line-height: 1;
        transition: color 0.2s;
      }

      .aba-chat-close:hover {
        color: #374151;
      }

      .aba-agent-intro {
        text-align: center;
        padding: 20px;
        background: #f9fafb;
      }

      .aba-agent-intro img {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        object-fit: cover;
        object-position: center 20%;
        margin-bottom: 10px;
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .aba-agent-intro .agent-name {
        font-weight: 600;
        font-size: 18px;
        color: #374151;
      }

      .aba-privacy-notice {
        background: #f3f4f6;
        padding: 12px 16px;
        font-size: 11px;
        color: #6b7280;
        line-height: 1.4;
        border-bottom: 1px solid #e5e7eb;
      }

      .aba-privacy-notice::after {
        content: ' ⓘ';
      }

      .aba-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: white;
      }

      .aba-message {
        margin-bottom: 12px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
      }

      .aba-message.bot {
        flex-direction: row;
      }

      .aba-message.user {
        flex-direction: row-reverse;
      }

      .aba-message-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
        object-position: center 20%;
        flex-shrink: 0;
      }

      .aba-message.user .aba-message-avatar {
        display: none;
      }

      .aba-message-content {
        display: flex;
        flex-direction: column;
        max-width: 75%;
      }

      .aba-message.user .aba-message-content {
        align-items: flex-end;
      }

      .aba-message-bubble {
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.5;
        word-wrap: break-word;
      }

      .aba-message.bot .aba-message-bubble {
        background: #f3f4f6;
        color: #374151;
        border-bottom-left-radius: 4px;
      }

      .aba-message.user .aba-message-bubble {
        background: var(--aba-primary-color, #DC2626);
        color: white;
        border-bottom-right-radius: 4px;
      }

      .aba-quick-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .aba-quick-button {
        background: var(--aba-primary-color, #DC2626);
        border: none;
        color: white;
        padding: 10px 24px;
        border-radius: 24px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .aba-quick-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        filter: brightness(1.1);
      }

      .aba-typing-indicator {
        display: flex;
        gap: 4px;
        padding: 10px 14px;
        background: #f3f4f6;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        width: fit-content;
      }

      .aba-typing-dot {
        width: 8px;
        height: 8px;
        background: #9ca3af;
        border-radius: 50%;
        animation: typingBounce 1.4s infinite;
      }

      .aba-typing-dot:nth-child(2) {
        animation-delay: 0.2s;
      }

      .aba-typing-dot:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes typingBounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-8px); }
      }

      .aba-chat-input-area {
        padding: 16px;
        background: white;
        border-top: 1px solid #e5e7eb;
      }

      .aba-chat-input-wrapper {
        display: flex;
        gap: 10px;
        align-items: center;
        background: #f3f4f6;
        border-radius: 24px;
        padding: 4px 4px 4px 16px;
      }

      .aba-chat-input {
        flex: 1;
        border: none;
        background: transparent;
        padding: 10px 0;
        font-size: 14px;
        outline: none;
      }

      .aba-chat-input::placeholder {
        color: #9ca3af;
      }

      .aba-chat-send {
        background: var(--aba-primary-color, #DC2626);
        border: none;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, filter 0.2s;
        flex-shrink: 0;
      }

      .aba-chat-send:hover {
        transform: scale(1.1);
        filter: brightness(1.1);
      }

      .aba-chat-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .aba-chat-send svg {
        width: 16px;
        height: 16px;
        fill: white;
      }

      @media (max-width: 480px) {
        #aba-chat-window {
          width: calc(100% - 16px);
          height: calc(100% - 80px);
          bottom: 8px;
          ${CONFIG.position}: 8px;
          border-radius: 12px;
        }

        #aba-medium-popup {
          width: calc(100% - 40px);
          ${CONFIG.position}: 20px;
        }

        #aba-chat-launcher {
          bottom: 15px;
          ${CONFIG.position}: 15px;
        }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  // Apply dynamic color
  function applyDynamicColor() {
    document.documentElement.style.setProperty('--aba-primary-color', state.detectedColor);
  }

  // Create widget HTML
  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'aba-chat-widget';
    
    widget.innerHTML = `
      <!-- Stage 1: Small circle -->
      <div id="aba-chat-launcher">
        <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}">
        <div class="notification-badge">1</div>
      </div>

      <!-- Stage 2: Medium popup -->
      <div id="aba-medium-popup">
        <div class="aba-medium-header">
          <button class="aba-medium-close">✕</button>
        </div>
        <div class="aba-medium-content">
          <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}" class="aba-medium-avatar">
          <div class="aba-medium-name">${CONFIG.agentName}</div>
          <div class="aba-medium-time">Just now</div>
          <div class="aba-medium-message">${CONFIG.greeting}</div>
          <div class="aba-medium-buttons">
            <button class="aba-medium-button" data-value="yes">Yes, I was injured</button>
            <button class="aba-medium-button" data-value="no">Just have questions</button>
            <button class="aba-medium-button" data-value="spanish">Español</button>
          </div>
          <div class="aba-medium-input">
            <input type="text" placeholder="Or type your question" id="aba-medium-input-field">
            <button id="aba-medium-send">
              <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Stage 3: Full chat window -->
      <div id="aba-chat-window">
        <div class="aba-chat-header">
          <div class="aba-chat-header-title">${CONFIG.companyName}</div>
          <button class="aba-chat-close">✕</button>
        </div>

        <div class="aba-agent-intro">
          <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}">
          <div class="agent-name">${CONFIG.agentName}</div>
        </div>

        <div class="aba-privacy-notice">
          ${CONFIG.privacyNotice}
        </div>
        
        <div class="aba-chat-messages" id="aba-messages-container">
        </div>

        <div class="aba-chat-input-area">
          <div class="aba-chat-input-wrapper">
            <input type="text" class="aba-chat-input" id="aba-user-input" placeholder="Message..." />
            <button class="aba-chat-send" id="aba-send-button">
              <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
  }

  // Switch between stages
  function setStage(newStage) {
    const launcher = document.getElementById('aba-chat-launcher');
    const mediumPopup = document.getElementById('aba-medium-popup');
    const fullWindow = document.getElementById('aba-chat-window');
    const badge = document.querySelector('.notification-badge');

    // Hide all first
    launcher.style.display = 'none';
    mediumPopup.classList.remove('open');
    fullWindow.classList.remove('open');

    state.stage = newStage;

    switch (newStage) {
      case 'small':
        launcher.style.display = 'block';
        badge.style.display = 'flex';
        break;
      case 'medium':
        mediumPopup.classList.add('open');
        badge.style.display = 'none';
        break;
      case 'full':
        fullWindow.classList.add('open');
        badge.style.display = 'none';
        break;
    }
  }

  // Add message to chat - NOW WITH AUTO BUTTON DETECTION! 🎯
  function addMessage(text, isBot = true, buttons = null) {
    const container = document.getElementById('aba-messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `aba-message ${isBot ? 'bot' : 'user'}`;

    let html = '';
    
    if (isBot) {
      html += `<img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}" class="aba-message-avatar">`;
    }
    
    html += `<div class="aba-message-content">`;
    html += `<div class="aba-message-bubble">${text}</div>`;

    // 🔥 AUTO-DETECT BUTTONS IF NOT PROVIDED
    if (isBot && !buttons) {
      buttons = detectButtons(text);
    }

    if (buttons && isBot) {
      html += '<div class="aba-quick-buttons">';
      buttons.forEach(btn => {
        html += `<button class="aba-quick-button" data-value="${btn.value}">${btn.label}</button>`;
      });
      html += '</div>';
    }
    
    html += '</div>';

    messageDiv.innerHTML = html;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;

    // Store message
    state.messages.push({
      role: isBot ? 'assistant' : 'user',
      content: text,
      timestamp: Date.now()
    });
  }

  // Show typing indicator
  function showTyping() {
    state.isTyping = true;
    const container = document.getElementById('aba-messages-container');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'aba-message bot';
    typingDiv.id = 'aba-typing';
    typingDiv.innerHTML = `
      <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}" class="aba-message-avatar">
      <div class="aba-message-content">
        <div class="aba-typing-indicator">
          <div class="aba-typing-dot"></div>
          <div class="aba-typing-dot"></div>
          <div class="aba-typing-dot"></div>
        </div>
      </div>
    `;
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
  }

  // Hide typing indicator
  function hideTyping() {
    state.isTyping = false;
    const typing = document.getElementById('aba-typing');
    if (typing) typing.remove();
  }

  // Send message to n8n webhook
  async function sendToWebhook(userMessage) {
    showTyping();

    try {
      const payload = {
        conversationId: state.conversationId,
        message: userMessage,
        messages: state.messages,
        collectedData: state.collectedData,
        userLocation: state.userLocation,
        trafficSource: getTrafficSource(),  
        timestamp: Date.now()
      };

      const response = await fetch(CONFIG.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      hideTyping();

      // Update collected data if returned
      if (data.collectedData) {
        state.collectedData = { ...state.collectedData, ...data.collectedData };
      }

      // Add bot response (buttons auto-detected in addMessage!)
      if (data.response) {
        setTimeout(() => {
          addMessage(data.response, true, data.buttons || null);
        }, 300);
      }

    } catch (error) {
      console.error('Webhook error:', error);
      hideTyping();
      addMessage("I'm sorry, I'm having trouble connecting. Please try again or call us directly.", true);
    }
  }

  // Handle user input
  function handleUserInput(text) {
    if (!text.trim()) return;
    
    addMessage(text, false);
    document.getElementById('aba-user-input').value = '';
    sendToWebhook(text);
  }

  // Open full chat from medium popup
  function openFullChat(initialMessage) {
    setStage('full');
    
    // Add the greeting as first bot message
    addMessage(CONFIG.greeting, true);
    
    // Add user's response
    addMessage(initialMessage, false);
    
    // Send to webhook
    sendToWebhook(initialMessage);
  }

  // Initialize event listeners
  function initEventListeners() {
    // Small launcher click -> open medium popup
    document.getElementById('aba-chat-launcher').addEventListener('click', () => {
      setStage('medium');
    });

    // Medium popup close -> back to small
    document.querySelector('.aba-medium-close').addEventListener('click', () => {
      setStage('small');
    });

    // Medium popup button clicks -> open full chat
    document.querySelectorAll('.aba-medium-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const label = e.target.textContent;
        openFullChat(label);
      });
    });

    // Medium popup text input
    document.getElementById('aba-medium-send').addEventListener('click', () => {
      const input = document.getElementById('aba-medium-input-field');
      if (input.value.trim()) {
        openFullChat(input.value.trim());
      }
    });

    document.getElementById('aba-medium-input-field').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        openFullChat(e.target.value.trim());
      }
    });

    // Full chat close -> back to small
    document.querySelector('.aba-chat-close').addEventListener('click', () => {
      setStage('small');
    });

    // Full chat send button
    document.getElementById('aba-send-button').addEventListener('click', () => {
      const input = document.getElementById('aba-user-input');
      handleUserInput(input.value);
    });

    // Full chat enter key
    document.getElementById('aba-user-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleUserInput(e.target.value);
      }
    });

    // Full chat quick button clicks (delegated)
    document.getElementById('aba-messages-container').addEventListener('click', (e) => {
      if (e.target.classList.contains('aba-quick-button')) {
        const value = e.target.getAttribute('data-value');
        
        // Remove buttons after click
        const buttonsContainer = e.target.closest('.aba-quick-buttons');
        if (buttonsContainer) buttonsContainer.remove();
        
        handleUserInput(value);
      }
    });
  }

  // Auto-open medium popup after delay
  function setupAutoOpen() {
    if (CONFIG.autoOpenDelay > 0) {
      setTimeout(() => {
        if (state.stage === 'small') {
          setStage('medium');
        }
      }, CONFIG.autoOpenDelay);
    }
  }

  // Initialize widget
  async function init() {
    detectPrimaryColor();
    injectStyles();
    applyDynamicColor();
    createWidget();
    initEventListeners();
    await detectLocation();
    setupAutoOpen();
    
    console.log('Justice League Chat Widget initialized ⚖️');
    console.log('Button auto-detection: ENABLED 🎯');
    console.log('Detected location:', state.userLocation);
    console.log('Primary color:', state.detectedColor);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
