(function() {
  'use strict';

  // Configuration - customize per client
  const CONFIG = {
    webhookUrl: 'https://kaielran.app.n8n.cloud/webhook/154e3fcd-43bd-4fcf-8079-4273a5f7d27e',
    companyName: 'Justice League',
    primaryColor: '#DC2626',
    agentName: 'Sarah',
    agentAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
    position: 'right',
    greeting: 'Hi! Were you recently injured in an accident?',
    autoOpenDelay: 3500,
    privacyNotice: 'By using this chat, you agree to our terms and privacy policy. Your conversation may be recorded for quality and training purposes.',
    collectFields: ['name', 'phone', 'email', 'accidentType', 'injurySeverity', 'state'],
    
    // Voice Configuration
    voiceEnabled: true,
    voiceTokenWebhookUrl: 'https://kaielran.app.n8n.cloud/webhook/voice/start',
    retellAgentId: 'agent_f8a4ac94d98f0bb283995c58d3',
    
    // Branding
    showDemoBanner: true,
    showPoweredBy: true
  };

  // State management
  let state = {
    stage: 'small',
    messages: [],
    collectedData: {},
    conversationId: generateId(),
    userLocation: null,
    isTyping: false,
    detectedColor: '#DC2626',
    callActive: false,
    callConnecting: false,
    aiSpeaking: false
  };

  let retellClient = null;

  function generateId() {
    return 'conv_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  // Button Detection Logic
  function detectButtons(messageText) {
    const text = messageText.toLowerCase();
    
    if (text.includes('what type of accident')) {
      return [
        {label: 'Car Accident', value: 'auto'},
        {label: 'Truck Accident', value: 'truck'},
        {label: 'Motorcycle', value: 'motorcycle'},
        {label: 'Slip & Fall', value: 'slip-fall'},
        {label: 'Dog Bite', value: 'dog bite'},
        {label: 'Workplace Injury', value: 'workplace'},
        {label: 'Medical Malpractice', value: 'medical malpractice'},
        {label: 'Other', value: 'other'}
      ];
    }
    
    if (text.includes('how serious were your injuries')) {
      return [
        {label: 'Minor - No medical treatment', value: 'minor'},
        {label: 'ER visit only', value: 'ER visit'},
        {label: 'Hospitalized', value: 'hospitalized'},
        {label: 'Ongoing treatment/therapy', value: 'ongoing treatment'},
        {label: 'Required surgery', value: 'surgery'}
      ];
    }
    
    if (text.includes('are you still receiving medical treatment')) {
      return [
        {label: 'Yes - Still treating', value: 'currently treating'},
        {label: 'Completed treatment', value: 'completed treatment'},
        {label: 'Haven\'t sought care yet', value: 'haven\'t sought care'},
        {label: 'Didn\'t need treatment', value: 'didn\'t need treatment'}
      ];
    }
    
    if (text.includes('who was at fault')) {
      return [
        {label: 'Clearly the other party', value: 'other party'},
        {label: 'Both of us (shared fault)', value: 'shared fault'},
        {label: 'Not sure', value: 'not sure'},
        {label: 'It might have been me', value: 'my fault'}
      ];
    }
    
    if (text.includes('was there a police report filed') || text.includes('police report filed')) {
      return [
        {label: 'Yes', value: 'yes'},
        {label: 'No', value: 'no'},
        {label: 'Not sure', value: 'not sure'}
      ];
    }
    
    if (text.includes('were there any witnesses')) {
      return [
        {label: 'Yes', value: 'yes'},
        {label: 'No', value: 'no'},
        {label: 'Not sure', value: 'not sure'}
      ];
    }
    
    if (text.includes('do you have auto insurance') || text.includes('do you have insurance')) {
      return [
        {label: 'Yes', value: 'yes'},
        {label: 'No', value: 'no'},
        {label: 'Not sure', value: 'not sure'}
      ];
    }
    
    if (text.includes('does the other party have insurance')) {
      return [
        {label: 'Yes', value: 'yes'},
        {label: 'No', value: 'no'},
        {label: 'Not sure', value: 'not sure'}
      ];
    }
    
    if (text.includes('have you already hired an attorney')) {
      return [
        {label: 'Yes - Already hired someone', value: 'yes'},
        {label: 'No - Haven\'t hired anyone yet', value: 'no'}
      ];
    }
    
    if (text.includes("you're in california") || text.includes('are you in california')) {
      return [
        {label: 'Yes - I\'m in California', value: 'California'},
        {label: 'No - I\'m in another state', value: 'other'}
      ];
    }
    
    return null;
  }

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
          return;
        }
      } catch (e) {}
    }
  }

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

  function injectStyles() {
    const styles = `
      #aba-chat-widget * {
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      }

      /* Small circle launcher */
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

      /* Medium popup */
      #aba-medium-popup {
        position: fixed;
        bottom: 20px;
        ${CONFIG.position}: 20px;
        width: 340px;
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

      /* Demo Banner */
      .aba-demo-banner {
        background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
        color: white;
        padding: 10px 16px;
        text-align: center;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.4;
        border-bottom: 2px solid #60a5fa;
      }

      .aba-demo-banner strong {
        color: #fbbf24;
        font-weight: 700;
      }

      .aba-demo-banner .demo-subtitle {
        display: block;
        font-size: 10px;
        opacity: 0.9;
        margin-top: 2px;
      }

      .aba-medium-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
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

      /* Powered by LeadPI badge */
      .aba-powered-by {
        font-size: 10px;
        color: #9ca3af;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .aba-powered-by span {
        color: #3b82f6;
        font-weight: 600;
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

      .aba-medium-agent-info {
        margin-bottom: 12px;
      }

      .aba-medium-name {
        font-weight: 600;
        font-size: 16px;
        color: #374151;
        margin-bottom: 4px;
      }

      .aba-medium-role {
        font-size: 12px;
        color: #6b7280;
      }

      .aba-medium-company-badge {
        display: inline-block;
        background: linear-gradient(135deg, var(--aba-primary-color, #dc2626) 0%, #b91c1c 100%);
        color: white;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        margin-top: 4px;
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

      /* Voice Call Button */
      .aba-voice-call-button {
        background: linear-gradient(135deg, #059669 0%, #047857 100%);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        border: none;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        width: 100%;
        margin-top: 12px;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
      }

      .aba-voice-call-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(5, 150, 105, 0.4);
      }

      .aba-voice-call-button:active {
        transform: translateY(0);
      }

      .aba-voice-call-button:disabled {
        background: #9ca3af;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }

      .aba-mode-hint {
        margin-top: 12px;
        font-size: 11px;
        color: #9ca3af;
        text-align: center;
      }

      /* Voice Call Modal */
      .aba-voice-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
        border-radius: 24px;
        padding: 40px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        z-index: 9999999;
        display: none;
        flex-direction: column;
        align-items: center;
        min-width: 320px;
        border: 1px solid #333;
      }

      .aba-voice-modal.active {
        display: flex;
        animation: modalFadeIn 0.3s ease;
      }

      @keyframes modalFadeIn {
        from {
          opacity: 0;
          transform: translate(-50%, -45%);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }

      .aba-voice-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        z-index: 9999998;
        display: none;
      }

      .aba-voice-modal-overlay.active {
        display: block;
        animation: overlayFadeIn 0.3s ease;
      }

      @keyframes overlayFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* Voice Avatar Container */
      .voice-avatar-container {
        position: relative;
        width: 160px;
        height: 160px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Sound Waves */
      .sound-waves {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        z-index: 0;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .voice-avatar-container.speaking .sound-waves {
        opacity: 0.4;
      }

      .sound-wave-bar {
        width: 3px;
        background: rgba(212, 175, 55, 0.6);
        border-radius: 2px;
      }

      .sound-wave-bar:nth-child(1) {
        height: 40px;
        animation: wave 1.2s ease-in-out infinite;
        animation-delay: 0s;
      }

      .sound-wave-bar:nth-child(2) {
        height: 60px;
        animation: wave 1.2s ease-in-out infinite;
        animation-delay: 0.1s;
      }

      .sound-wave-bar:nth-child(3) {
        height: 80px;
        animation: wave 1.2s ease-in-out infinite;
        animation-delay: 0.2s;
      }

      .sound-wave-bar:nth-child(4) {
        height: 60px;
        animation: wave 1.2s ease-in-out infinite;
        animation-delay: 0.3s;
      }

      .sound-wave-bar:nth-child(5) {
        height: 40px;
        animation: wave 1.2s ease-in-out infinite;
        animation-delay: 0.4s;
      }

      @keyframes wave {
        0%, 100% {
          transform: scaleY(0.3);
        }
        50% {
          transform: scaleY(1);
        }
      }

      .voice-avatar-container.speaking .sound-wave-bar {
        opacity: 0.8;
      }

      .voice-avatar {
        position: relative;
        z-index: 2;
        width: 120px;
        height: 120px;
        border-radius: 50%;
        object-fit: cover;
        object-position: center 20%;
        border: 4px solid #d4af37;
        box-shadow: 0 8px 24px rgba(212, 175, 55, 0.3);
        transition: all 0.3s ease;
      }

      .voice-avatar-container.speaking .voice-avatar {
        box-shadow: 0 8px 32px rgba(212, 175, 55, 0.6), 0 0 40px rgba(212, 175, 55, 0.4);
        border-color: #ffd700;
      }

      .voice-avatar-container.connecting .voice-avatar {
        animation: gentlePulse 2s ease-in-out infinite;
      }

      @keyframes gentlePulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 8px 24px rgba(212, 175, 55, 0.3);
        }
        50% {
          transform: scale(1.03);
          box-shadow: 0 8px 32px rgba(212, 175, 55, 0.5);
        }
      }

      .voice-modal-status {
        color: #d1d5db;
        font-size: 14px;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .voice-modal-agent-name {
        color: white;
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 8px;
      }

      .voice-modal-message {
        color: #9ca3af;
        font-size: 14px;
        margin-bottom: 24px;
        text-align: center;
        line-height: 1.5;
      }

      .voice-modal-disclaimer {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 20px;
        text-align: center;
      }

      .voice-modal-disclaimer-text {
        color: #93c5fd;
        font-size: 12px;
        line-height: 1.4;
      }

      .voice-modal-disclaimer strong {
        color: #60a5fa;
        font-weight: 700;
      }

      .voice-modal-actions {
        display: flex;
        gap: 12px;
        width: 100%;
      }

      .voice-end-call-btn {
        flex: 1;
        background: #dc2626;
        color: white;
        border: none;
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .voice-end-call-btn:hover {
        background: #b91c1c;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
      }

      /* Full chat window */
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

  function applyDynamicColor() {
    document.documentElement.style.setProperty('--aba-primary-color', state.detectedColor);
  }

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'aba-chat-widget';
    
    const demoBannerHTML = CONFIG.showDemoBanner ? `
      <div class="aba-demo-banner">
        <strong>DEMO:</strong> AI Intake for ${CONFIG.companyName}
        <span class="demo-subtitle">This is a demonstration showing LeadPI's capabilities</span>
      </div>
    ` : '';

    const poweredByHTML = CONFIG.showPoweredBy ? `
      <div class="aba-powered-by">Powered by <span>LeadPI</span></div>
    ` : '<div></div>';

    const voiceButtonHTML = CONFIG.voiceEnabled ? `
      <button class="aba-voice-call-button" id="start-voice-call">
        Or Talk to ${CONFIG.agentName} Now
      </button>
      <div class="aba-mode-hint">
        Chat or Voice - Your choice!
      </div>
    ` : '';

    const voiceModalHTML = CONFIG.voiceEnabled ? `
      <div class="aba-voice-modal-overlay" id="voice-modal-overlay"></div>
      <div class="aba-voice-modal" id="voice-modal">
        <div class="voice-avatar-container" id="voice-avatar-container">
          <div class="sound-waves">
            <div class="sound-wave-bar"></div>
            <div class="sound-wave-bar"></div>
            <div class="sound-wave-bar"></div>
            <div class="sound-wave-bar"></div>
            <div class="sound-wave-bar"></div>
          </div>
          <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}" class="voice-avatar">
        </div>
        
        <div class="voice-modal-status" id="call-status">CONNECTING</div>
        <div class="voice-modal-agent-name">${CONFIG.agentName}</div>
        <div class="voice-modal-message" id="call-message">Connecting to AI agent...</div>

        ${CONFIG.showDemoBanner ? `
        <div class="voice-modal-disclaimer">
          <div class="voice-modal-disclaimer-text">
            <strong>DEMO:</strong> This is a demonstration call with an AI agent representing <strong>${CONFIG.companyName}</strong>.
          </div>
        </div>
        ` : ''}

        <div class="voice-modal-actions">
          <button class="voice-end-call-btn" id="end-call-btn">End Call</button>
        </div>
      </div>
    ` : '';
    
    widget.innerHTML = `
      <!-- Small circle launcher -->
      <div id="aba-chat-launcher">
        <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}">
        <div class="notification-badge">1</div>
      </div>

      <!-- Medium popup -->
      <div id="aba-medium-popup">
        ${demoBannerHTML}
        <div class="aba-medium-header">
          ${poweredByHTML}
          <button class="aba-medium-close">&times;</button>
        </div>
        <div class="aba-medium-content">
          <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}" class="aba-medium-avatar">
          <div class="aba-medium-agent-info">
            <div class="aba-medium-name">${CONFIG.agentName}</div>
            <div class="aba-medium-role">AI Intake Specialist</div>
            <div class="aba-medium-company-badge">${CONFIG.companyName}</div>
          </div>
          <div class="aba-medium-message">${CONFIG.greeting}</div>
          <div class="aba-medium-buttons">
            <button class="aba-medium-button" data-value="yes">Yes, I was injured</button>
            <button class="aba-medium-button" data-value="no">Just have questions</button>
            <button class="aba-medium-button" data-value="spanish">Espanol</button>
          </div>
          ${voiceButtonHTML}
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

      ${voiceModalHTML}

      <!-- Full chat window -->
      <div id="aba-chat-window">
        <div class="aba-chat-header">
          <div class="aba-chat-header-title">${CONFIG.companyName}</div>
          <button class="aba-chat-close">&times;</button>
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

  // Voice Functions
  function loadRetellSDK() {
    return new Promise(async (resolve, reject) => {
      if (window.RetellWebClient) {
        resolve();
        return;
      }

      try {
        const module = await import('https://cdn.jsdelivr.net/npm/retell-client-js-sdk@2.0.7/+esm');
        window.RetellWebClient = module.RetellWebClient;
        console.log('Retell SDK loaded');
        resolve();
      } catch (error) {
        reject(new Error('Failed to load Retell SDK: ' + error.message));
      }
    });
  }

  async function getRetellAccessToken() {
    console.log('Fetching Retell access token from n8n...');
    
    const response = await fetch(CONFIG.voiceTokenWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: 'leadpi-widget',
        conversationId: state.conversationId,
        userLocation: state.userLocation,
        trafficSource: getTrafficSource()
      })
    });

    if (!response.ok) {
      throw new Error('Token request failed: ' + response.status);
    }

    const data = await response.json();
    
    if (!data.success || !data.access_token) {
      throw new Error('No access token in response');
    }

    console.log('Got access token, call_id:', data.call_id);
    return data.access_token;
  }

  async function startVoiceCall() {
    if (!CONFIG.voiceEnabled) return;
    
    const voiceButton = document.getElementById('start-voice-call');
    
    try {
      state.callConnecting = true;
      voiceButton.disabled = true;
      voiceButton.textContent = 'Connecting...';
      
      const voiceModal = document.getElementById('voice-modal');
      const overlay = document.getElementById('voice-modal-overlay');
      const avatarContainer = document.getElementById('voice-avatar-container');
      
      voiceModal.classList.add('active');
      overlay.classList.add('active');
      avatarContainer.classList.add('connecting');
      
      document.getElementById('call-status').textContent = 'CONNECTING';
      document.getElementById('call-message').textContent = 'Getting access token...';
      
      setStage('small');

      await loadRetellSDK();
      document.getElementById('call-message').textContent = 'Initializing...';

      if (!retellClient) {
        retellClient = new window.RetellWebClient();
        
        retellClient.on('call_started', () => {
          console.log('Call started');
          state.callActive = true;
          state.callConnecting = false;
          
          avatarContainer.classList.remove('connecting');
          document.getElementById('call-status').textContent = 'CONNECTED';
          document.getElementById('call-message').textContent = CONFIG.agentName + ' is listening. Start speaking...';
        });

        retellClient.on('agent_start_talking', () => {
          console.log('Agent speaking');
          state.aiSpeaking = true;
          document.getElementById('voice-avatar-container').classList.add('speaking');
        });

        retellClient.on('agent_stop_talking', () => {
          console.log('Agent listening');
          state.aiSpeaking = false;
          document.getElementById('voice-avatar-container').classList.remove('speaking');
          document.getElementById('call-status').textContent = 'LISTENING';
        });

        retellClient.on('call_ended', () => {
          console.log('Call ended');
          endVoiceCall();
        });

        retellClient.on('error', (error) => {
          console.error('Retell error:', error);
          document.getElementById('call-message').textContent = 'Call error: ' + (error.message || 'Unknown error');
          setTimeout(() => endVoiceCall(), 2000);
        });
      }

      document.getElementById('call-message').textContent = 'Connecting to ' + CONFIG.agentName + '...';
      const accessToken = await getRetellAccessToken();

      await retellClient.startCall({
        accessToken: accessToken,
        sampleRate: 24000,
      });

      console.log('Call initiated successfully');
      
    } catch (error) {
      console.error('Failed to start call:', error);
      document.getElementById('call-status').textContent = 'ERROR';
      document.getElementById('call-message').textContent = 'Failed to connect: ' + error.message;
      
      setTimeout(() => {
        endVoiceCall();
      }, 3000);
    } finally {
      voiceButton.disabled = false;
      voiceButton.textContent = 'Or Talk to ' + CONFIG.agentName + ' Now';
    }
  }

  function endVoiceCall() {
    if (retellClient && state.callActive) {
      try {
        retellClient.stopCall();
      } catch (e) {
        console.log('Call already ended');
      }
    }
    
    state.callActive = false;
    state.callConnecting = false;
    state.aiSpeaking = false;
    
    const voiceModal = document.getElementById('voice-modal');
    const overlay = document.getElementById('voice-modal-overlay');
    const avatarContainer = document.getElementById('voice-avatar-container');
    
    if (voiceModal) voiceModal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    if (avatarContainer) avatarContainer.classList.remove('speaking', 'connecting');

    const voiceButton = document.getElementById('start-voice-call');
    if (voiceButton) {
      voiceButton.disabled = false;
      voiceButton.textContent = 'Or Talk to ' + CONFIG.agentName + ' Now';
    }
  }

  function setStage(newStage) {
    const launcher = document.getElementById('aba-chat-launcher');
    const mediumPopup = document.getElementById('aba-medium-popup');
    const fullWindow = document.getElementById('aba-chat-window');
    const badge = document.querySelector('.notification-badge');

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

  function addMessage(text, isBot = true, buttons = null) {
    const container = document.getElementById('aba-messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'aba-message ' + (isBot ? 'bot' : 'user');

    let html = '';
    
    if (isBot) {
      html += '<img src="' + CONFIG.agentAvatar + '" alt="' + CONFIG.agentName + '" class="aba-message-avatar">';
    }
    
    html += '<div class="aba-message-content">';
    html += '<div class="aba-message-bubble">' + text + '</div>';

    if (isBot && !buttons) {
      buttons = detectButtons(text);
    }

    if (buttons && isBot) {
      html += '<div class="aba-quick-buttons">';
      buttons.forEach(btn => {
        html += '<button class="aba-quick-button" data-value="' + btn.value + '">' + btn.label + '</button>';
      });
      html += '</div>';
    }
    
    html += '</div>';

    messageDiv.innerHTML = html;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;

    state.messages.push({
      role: isBot ? 'assistant' : 'user',
      content: text,
      timestamp: Date.now()
    });
  }

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

  function hideTyping() {
    state.isTyping = false;
    const typing = document.getElementById('aba-typing');
    if (typing) typing.remove();
  }

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

      if (data.collectedData) {
        state.collectedData = { ...state.collectedData, ...data.collectedData };
      }

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

  function handleUserInput(text) {
    if (!text.trim()) return;
    
    addMessage(text, false);
    document.getElementById('aba-user-input').value = '';
    sendToWebhook(text);
  }

  function openFullChat(initialMessage) {
    setStage('full');
    addMessage(CONFIG.greeting, true);
    addMessage(initialMessage, false);
    sendToWebhook(initialMessage);
  }

  function initEventListeners() {
    document.getElementById('aba-chat-launcher').addEventListener('click', () => {
      setStage('medium');
    });

    document.querySelector('.aba-medium-close').addEventListener('click', () => {
      setStage('small');
    });

    document.querySelectorAll('.aba-medium-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const label = e.target.textContent;
        openFullChat(label);
      });
    });

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

    document.querySelector('.aba-chat-close').addEventListener('click', () => {
      setStage('small');
    });

    document.getElementById('aba-send-button').addEventListener('click', () => {
      const input = document.getElementById('aba-user-input');
      handleUserInput(input.value);
    });

    document.getElementById('aba-user-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleUserInput(e.target.value);
      }
    });

    document.getElementById('aba-messages-container').addEventListener('click', (e) => {
      if (e.target.classList.contains('aba-quick-button')) {
        const value = e.target.getAttribute('data-value');
        const buttonsContainer = e.target.closest('.aba-quick-buttons');
        if (buttonsContainer) buttonsContainer.remove();
        handleUserInput(value);
      }
    });

    // Voice event listeners
    if (CONFIG.voiceEnabled) {
      document.getElementById('start-voice-call').addEventListener('click', startVoiceCall);
      document.getElementById('end-call-btn').addEventListener('click', endVoiceCall);
      document.getElementById('voice-modal-overlay').addEventListener('click', endVoiceCall);
    }
  }

  function setupAutoOpen() {
    if (CONFIG.autoOpenDelay > 0) {
      setTimeout(() => {
        if (state.stage === 'small') {
          setStage('medium');
        }
      }, CONFIG.autoOpenDelay);
    }
  }

  async function init() {
    detectPrimaryColor();
    injectStyles();
    applyDynamicColor();
    createWidget();
    initEventListeners();
    await detectLocation();
    setupAutoOpen();
    
    console.log('LeadPI Widget initialized');
    console.log('Voice enabled:', CONFIG.voiceEnabled);
    console.log('Button auto-detection: ENABLED');
    console.log('Detected location:', state.userLocation);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
