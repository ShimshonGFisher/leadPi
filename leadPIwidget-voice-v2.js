(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    webhookUrl: 'https://kaielran.app.n8n.cloud/webhook/154e3fcd-43bd-4fcf-8079-4273a5f7d27e',
    companyName: 'Justice League',
    primaryColor: '#DC2626',
    agentName: 'Sarah',
    agentAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
    position: 'right',
    greeting: 'Hi! 👋 Were you recently injured in an accident?',
    autoOpenDelay: 3500,
    privacyNotice: 'By using this chat, you agree to our terms and privacy policy. Your conversation may be recorded for quality and training purposes.',
    collectFields: ['name', 'phone', 'email', 'accidentType', 'injurySeverity', 'state'],
    
    // Retell Voice Configuration
    retellAgentId: 'your-retell-agent-id-here', // UPDATE THIS from Retell dashboard
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

  // Detect website's primary color
  function detectPrimaryColor() {
    if (CONFIG.primaryColor) {
      state.detectedColor = CONFIG.primaryColor;
      return;
    }
    const colorSources = [
      () => getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
      () => getComputedStyle(document.documentElement).getPropertyValue('--brand-color'),
      () => {
        const btn = document.querySelector('button, .btn');
        if (btn) {
          const bg = getComputedStyle(btn).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
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

      /* Demo Disclaimer Banner */
      .leadpi-demo-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
        color: white;
        padding: 12px 20px;
        text-align: center;
        z-index: 999999;
        font-size: 14px;
        font-weight: 500;
        border-bottom: 2px solid #60a5fa;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }

      .leadpi-demo-banner strong {
        color: #fbbf24;
        font-weight: 700;
      }

      /* Small launcher */
      #aba-chat-launcher {
        position: fixed;
        bottom: 20px;
        ${CONFIG.position}: 20px;
        width: 90px;
        height: 90px;
        border-radius: 50%;
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

      /* HUMAN-CENTERED VOICE UI - Avatar + Sound Waves */
      .voice-avatar-container {
        position: relative;
        width: 160px;
        height: 160px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Sound Wave Background */
      .sound-waves {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        z-index: 1;
      }

      .sound-wave-bar {
        width: 4px;
        background: linear-gradient(180deg, #d4af37 0%, #a67c00 100%);
        border-radius: 2px;
        opacity: 0;
        transition: opacity 0.3s ease;
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

      /* Show waves when speaking */
      .voice-avatar-container.speaking .sound-wave-bar {
        opacity: 0.8;
      }

      /* Avatar Image */
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

      /* Subtle pulse when speaking */
      .voice-avatar-container.speaking .voice-avatar {
        box-shadow: 0 8px 32px rgba(212, 175, 55, 0.6), 0 0 40px rgba(212, 175, 55, 0.4);
        border-color: #ffd700;
      }

      /* Connecting state - gentle pulse */
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
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 100px);
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        display: none;
        flex-direction: column;
        z-index: 999999;
        overflow: hidden;
        animation: slideUp 0.4s ease;
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(30px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      #aba-chat-window.open {
        display: flex;
      }

      .aba-chat-header {
        background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
        color: white;
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        border-bottom: 1px solid #333;
      }

      .aba-chat-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 20px;
        padding: 0;
        line-height: 1;
      }

      .aba-agent-intro {
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .aba-agent-intro img {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        object-position: center 20%;
      }

      .aba-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        background: #f9fafb;
      }

      .aba-chat-input-area {
        padding: 16px 20px;
        border-top: 1px solid #e5e7eb;
        background: white;
      }

      .aba-chat-input-wrapper {
        display: flex;
        gap: 8px;
      }

      .aba-chat-input {
        flex: 1;
        padding: 10px 16px;
        border: 2px solid #e5e7eb;
        border-radius: 24px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }

      .aba-chat-input:focus {
        border-color: var(--aba-primary-color, #DC2626);
      }

      .aba-chat-send {
        background: var(--aba-primary-color, #DC2626);
        color: white;
        border: none;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .aba-chat-send:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }

      @media (max-width: 480px) {
        #aba-chat-window {
          width: calc(100vw - 20px);
          height: calc(100vh - 80px);
          bottom: 10px;
          ${CONFIG.position}: 10px;
        }

        #aba-medium-popup {
          width: calc(100vw - 40px);
        }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  function applyDynamicColor() {
    const root = document.documentElement;
    root.style.setProperty('--aba-primary-color', state.detectedColor);
  }

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'aba-chat-widget';
    widget.innerHTML = `
      <!-- Demo Banner -->
      <div class="leadpi-demo-banner">
        🎯 <strong>DEMO MODE:</strong> This is a demonstration of LeadPI's AI intake system for personal injury law firms.
      </div>

      <!-- Small launcher -->
      <div id="aba-chat-launcher">
        <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}">
        <div class="notification-badge">!</div>
      </div>

      <!-- Medium popup -->
      <div id="aba-medium-popup">
        <div class="aba-medium-header">
          <button class="aba-medium-close">✕</button>
        </div>
        <div class="aba-medium-content">
          <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}" class="aba-medium-avatar">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${CONFIG.agentName}</div>
          <div style="font-size: 12px; color: #9ca3af; margin-bottom: 16px;">AI Intake Specialist</div>
          <div class="aba-medium-message">${CONFIG.greeting}</div>
          
          <div class="aba-medium-buttons">
            <button class="aba-medium-button" data-value="yes">Yes, I was injured</button>
            <button class="aba-medium-button" data-value="no">Just have questions</button>
          </div>

          <button class="aba-voice-call-button" id="start-voice-call">
            📞 Or Talk to Sarah Now
          </button>

          <div style="margin-top: 12px; font-size: 11px; color: #9ca3af; text-align: center;">
            💬 Chat or 🎤 Voice - Your choice!
          </div>
        </div>
      </div>

      <!-- Voice Call Modal - HUMAN-CENTERED DESIGN -->
      <div class="aba-voice-modal-overlay" id="voice-modal-overlay"></div>
      <div class="aba-voice-modal" id="voice-modal">
        <div class="voice-avatar-container" id="voice-avatar-container">
          <!-- Sound wave bars behind avatar -->
          <div class="sound-waves">
            <div class="sound-wave-bar"></div>
            <div class="sound-wave-bar"></div>
            <div class="sound-wave-bar"></div>
            <div class="sound-wave-bar"></div>
            <div class="sound-wave-bar"></div>
          </div>
          
          <!-- Sarah's face in center -->
          <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}" class="voice-avatar">
        </div>
        
        <div class="voice-modal-status" id="call-status">CONNECTING</div>
        <div class="voice-modal-agent-name">${CONFIG.agentName}</div>
        <div class="voice-modal-message" id="call-message">Connecting to AI agent...</div>

        <div class="voice-modal-disclaimer">
          <div class="voice-modal-disclaimer-text">
            <strong>DEMO NOTICE:</strong> This is a demonstration call with an AI agent representing <strong>Justice League</strong>, a fictitious law firm.
          </div>
        </div>

        <div class="voice-modal-actions">
          <button class="voice-end-call-btn" id="end-call-btn">End Call</button>
        </div>
      </div>

      <!-- Full chat window (keeping original) -->
      <div id="aba-chat-window">
        <div class="aba-chat-header">
          <div>${CONFIG.companyName}</div>
          <button class="aba-chat-close">✕</button>
        </div>
        <div class="aba-agent-intro">
          <img src="${CONFIG.agentAvatar}" alt="${CONFIG.agentName}">
          <div style="font-weight: 600;">${CONFIG.agentName}</div>
        </div>
        <div class="aba-chat-messages" id="aba-messages-container"></div>
        <div class="aba-chat-input-area">
          <div class="aba-chat-input-wrapper">
            <input type="text" class="aba-chat-input" id="aba-user-input" placeholder="Message..." />
            <button class="aba-chat-send" id="aba-send-button">➤</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
  }

  // Load Retell SDK
  function loadRetellSDK() {
    return new Promise((resolve, reject) => {
      if (window.RetellWebClient) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/retell-client-js-sdk@2.3.2/dist/index.umd.min.js';
      script.onload = () => {
        console.log('✅ Retell SDK loaded');
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load Retell SDK'));
      document.head.appendChild(script);
    });
  }

  // Start voice call
  async function startVoiceCall() {
    try {
      state.callConnecting = true;
      
      // Show voice modal
      const voiceModal = document.getElementById('voice-modal');
      const overlay = document.getElementById('voice-modal-overlay');
      const avatarContainer = document.getElementById('voice-avatar-container');
      
      voiceModal.classList.add('active');
      overlay.classList.add('active');
      avatarContainer.classList.add('connecting');
      
      document.getElementById('call-status').textContent = 'CONNECTING';
      document.getElementById('call-message').textContent = 'Connecting to Sarah...';
      
      // Close medium popup
      setStage('small');

      // Initialize Retell client if not already done
      if (!retellClient) {
        await loadRetellSDK();
        retellClient = new window.RetellWebClient();
        
        // Set up event listeners
        retellClient.on('call_started', () => {
          console.log('Call started');
          state.callActive = true;
          state.callConnecting = false;
          
          avatarContainer.classList.remove('connecting');
          document.getElementById('call-status').textContent = 'CONNECTED';
          document.getElementById('call-message').textContent = 'Sarah is listening. Start speaking...';
        });

        retellClient.on('agent_start_talking', () => {
          console.log('Agent speaking');
          state.aiSpeaking = true;
          avatarContainer.classList.add('speaking');
          document.getElementById('call-status').textContent = 'SARAH SPEAKING';
        });

        retellClient.on('agent_stop_talking', () => {
          console.log('Agent stopped');
          state.aiSpeaking = false;
          avatarContainer.classList.remove('speaking');
          document.getElementById('call-status').textContent = 'LISTENING';
        });

        retellClient.on('call_ended', () => {
          console.log('Call ended');
          endVoiceCall();
        });

        retellClient.on('error', (error) => {
          console.error('Retell error:', error);
          alert('Call error: ' + error.message);
          endVoiceCall();
        });
      }

      // Get access token from Retell (you'll need to implement this endpoint)
      // For demo, using agent ID directly (requires Retell API key on client - not secure for production)
      const startCallResponse = await retellClient.startCall({
        agentId: CONFIG.retellAgentId,
        sampleRate: 24000,
      });

      console.log('Call started:', startCallResponse);
      
    } catch (error) {
      console.error('Failed to start call:', error);
      alert('Failed to start call. Please check console for details.');
      endVoiceCall();
    }
  }

  function endVoiceCall() {
    if (retellClient) {
      retellClient.stopCall();
    }
    
    state.callActive = false;
    state.callConnecting = false;
    state.aiSpeaking = false;
    
    const voiceModal = document.getElementById('voice-modal');
    const overlay = document.getElementById('voice-modal-overlay');
    const avatarContainer = document.getElementById('voice-avatar-container');
    
    voiceModal.classList.remove('active');
    overlay.classList.remove('active');
    avatarContainer.classList.remove('speaking', 'connecting');
  }

  function setStage(newStage) {
    const launcher = document.getElementById('aba-chat-launcher');
    const mediumPopup = document.getElementById('aba-medium-popup');
    const fullWindow = document.getElementById('aba-chat-window');

    launcher.style.display = 'none';
    mediumPopup.classList.remove('open');
    fullWindow.classList.remove('open');

    state.stage = newStage;

    switch (newStage) {
      case 'small':
        launcher.style.display = 'block';
        break;
      case 'medium':
        mediumPopup.classList.add('open');
        break;
      case 'full':
        fullWindow.classList.add('open');
        break;
    }
  }

  function initEventListeners() {
    // Small launcher -> medium popup
    document.getElementById('aba-chat-launcher').addEventListener('click', () => {
      setStage('medium');
    });

    // Medium popup close
    document.querySelector('.aba-medium-close').addEventListener('click', () => {
      setStage('small');
    });

    // Voice call button
    document.getElementById('start-voice-call').addEventListener('click', startVoiceCall);

    // End call button
    document.getElementById('end-call-btn').addEventListener('click', endVoiceCall);

    // Medium popup buttons -> open full chat
    document.querySelectorAll('.aba-medium-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        setStage('full');
        // ... existing chat logic
      });
    });

    // Chat window close
    document.querySelector('.aba-chat-close').addEventListener('click', () => {
      setStage('small');
    });
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
    
    console.log('LeadPI Voice Widget v2 initialized 🎤');
    console.log('Human-centered voice UI with Sarah\'s avatar + sound waves');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

