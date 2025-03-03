document.addEventListener('DOMContentLoaded', () => {
    // API configuration
    const API_URL = 'http://localhost:3000/api';
    let authToken = localStorage.getItem('authToken');
    let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    let currentChatId = localStorage.getItem('currentChatId');
    
    // DOM elements
    const chatInput = document.querySelector('.chat-input textarea');
    const sendButton = document.querySelector('.send-btn');
    const chatMessages = document.querySelector('.chat-messages');
    const goalTabs = document.querySelectorAll('.tab-btn');
    const goalsList = document.querySelector('.goals-list');
    
    // Check if user is logged in
    const isAuthenticated = () => {
        return !!authToken;
    };
    
    // API request helper
    const apiRequest = async (endpoint, method = 'GET', data = null) => {
        try {
            console.log(`Making API request to ${API_URL}${endpoint}`);
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
                console.log('Using auth token:', authToken.substring(0, 10) + '...');
            } else {
                console.warn('No auth token available');
                
                // For testing: Generate a temporary demo token if none exists
                const tempToken = 'demo_token_' + Math.random().toString(36).substring(2);
                headers['Authorization'] = `Bearer ${tempToken}`;
                console.log('Using temporary demo token:', tempToken.substring(0, 10) + '...');
            }
            
            const config = {
                method,
                headers
            };
            
            if (data) {
                config.body = JSON.stringify(data);
                console.log('Request data:', data);
            }
            
            try {
                const response = await fetch(`${API_URL}${endpoint}`, config);
                console.log(`API response status: ${response.status}`);
                
                const result = await response.json();
                console.log('API response data:', result);
                
                if (!response.ok) {
                    throw new Error(result.message || 'API request failed');
                }
                
                return result;
            } catch (fetchError) {
                console.error('Fetch error:', fetchError);
                
                // For demo/testing, return a simulated success response
                if (endpoint.includes('/chat')) {
                    console.log('Returning simulated chat response for testing');
                    
                    if (endpoint.includes('/messages')) {
                        return {
                            success: true,
                            message: 'Message sent (simulated)',
                            response: {
                                role: 'assistant',
                                content: simulateAIResponse(data.message || data.initialMessage),
                                timestamp: new Date()
                            }
                        };
                    } else {
                        return {
                            success: true,
                            message: 'Chat session created (simulated)',
                            session: {
                                id: 'sim_' + Math.random().toString(36).substring(2),
                                title: 'Simulated Chat',
                                messages: [
                                    {
                                        role: 'user',
                                        content: data?.initialMessage || 'Hello',
                                        timestamp: new Date()
                                    },
                                    {
                                        role: 'assistant',
                                        content: simulateAIResponse(data?.initialMessage || 'Hello'),
                                        timestamp: new Date()
                                    }
                                ]
                            }
                        };
                    }
                }
                
                throw fetchError;
            }
        } catch (error) {
            console.error('API request error:', error);
            // Show error in the UI for debugging
            if (chatMessages) {
                const errorMsg = document.createElement('div');
                errorMsg.className = 'message system error';
                errorMsg.innerHTML = `<p>Error connecting to API: ${error.message}</p><p>Check browser console for details.</p>`;
                chatMessages.appendChild(errorMsg);
            }
            return { success: false, error: error.message };
        }
    };
    
    // Login/Register handling (for demo purposes)
    const showLoginForm = () => {
        // Check if we're on any page that requires authentication
        const requiresAuth = document.querySelector('.chat-container') || 
                             document.querySelector('.goals-container') ||
                             document.querySelector('.tasks-container') ||
                             document.querySelector('.logs-container') ||
                             document.querySelector('.insights-container');
        
        if (requiresAuth && !isAuthenticated()) {
            // Hide the main content
            document.querySelectorAll('main > div').forEach(div => {
                div.style.display = 'none';
            });
            
            // Create and show a login form
            const loginForm = document.createElement('div');
            loginForm.className = 'auth-container';
            loginForm.innerHTML = `
                <div class="auth-form">
                    <h2>Login or Register</h2>
                    <p>Please login to use Racho AI Assistant</p>
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" placeholder="your@email.com">
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" placeholder="********">
                    </div>
                    <div class="form-group" id="name-group" style="display: none;">
                        <label for="name">Full Name</label>
                        <input type="text" id="name" placeholder="Your Name">
                    </div>
                    <div class="auth-buttons">
                        <button id="login-btn" class="primary-btn">Login</button>
                        <button id="register-btn" class="secondary-btn">Register</button>
                    </div>
                    <p class="demo-note">Demo mode available: Click Login with any email/password</p>
                </div>
            `;
            
            document.querySelector('main').appendChild(loginForm);
            
            // Add event listeners for login and register
            document.getElementById('login-btn').addEventListener('click', async () => {
                const email = document.getElementById('email').value.trim();
                const password = document.getElementById('password').value.trim();
                
                if (!email || !password) {
                    alert('Please enter both email and password');
                    return;
                }
                
                try {
                    console.log('Calling real login API...');
                    const response = await fetch(`${API_URL}/auth/login`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email, password })
                    });
                    
                    const result = await response.json();
                    console.log('Login API response:', result);
                    
                    if (result.success && result.token) {
                        // Save the token and user data
                        authToken = result.token;
                        localStorage.setItem('authToken', authToken);
                        
                        currentUser = result.user;
                        localStorage.setItem('currentUser', JSON.stringify(currentUser));
                        
                        // Reload the page to show the authenticated content
                        window.location.reload();
                    } else {
                        alert(`Login failed: ${result.message || 'Unknown error'}`);
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    alert('Error logging in. Please try again.');
                    
                    // Fall back to simulated login for development
                    if (confirm('API login failed. Use simulated login instead?')) {
                        simulateLogin(email);
                    }
                }
            });
            
            document.getElementById('register-btn').addEventListener('click', () => {
                const nameGroup = document.getElementById('name-group');
                const loginBtn = document.getElementById('login-btn');
                
                if (nameGroup.style.display === 'none') {
                    // Show the name field for registration
                    nameGroup.style.display = 'block';
                    loginBtn.style.display = 'none';
                    document.getElementById('register-btn').textContent = 'Create Account';
                } else {
                    // Handle registration
                    const email = document.getElementById('email').value.trim();
                    const password = document.getElementById('password').value.trim();
                    const name = document.getElementById('name').value.trim();
                    
                    if (!email || !password || !name) {
                        alert('Please fill in all fields');
                        return;
                    }
                    
                    try {
                        console.log('Calling real register API...');
                        const response = await fetch(`${API_URL}/auth/register`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ email, password, name })
                        });
                        
                        const result = await response.json();
                        console.log('Register API response:', result);
                        
                        if (result.success && result.token) {
                            // Save the token and user data
                            authToken = result.token;
                            localStorage.setItem('authToken', authToken);
                            
                            currentUser = result.user;
                            localStorage.setItem('currentUser', JSON.stringify(currentUser));
                            
                            // Reload the page to show the authenticated content
                            window.location.reload();
                        } else {
                            alert(`Registration failed: ${result.message || 'Unknown error'}`);
                        }
                    } catch (error) {
                        console.error('Registration error:', error);
                        alert('Error registering. Please try again.');
                        
                        // Fall back to simulated login for development
                        if (confirm('API registration failed. Use simulated login instead?')) {
                            simulateLogin(email, name);
                        }
                    }
                }
            });
        }
    };
    
    // Login with a real JWT token - no simulation
    const simulateLogin = (email, name = '') => {
        // Use a real JWT token signed with our JWT_SECRET
        // This token includes the actual MongoDB user ID
        authToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3YzIwMzY0Y2I1ZGI1ODM2NzU1ODI2MiIsImVtYWlsIjoiY2hhcmxpZUBnbWFpbC5jb20iLCJuYW1lIjoiQ2hhcmxpZSBSdW5uZWxzIiwiaWF0IjoxNzQwNzY4MTIxLCJleHAiOjQ4OTY1MjgxMjF9.5v79IvuoVfgZf5cfbmVRcj-EsI9Gx278boA05xUtU7s';
        localStorage.setItem('authToken', authToken);
        
        // Create a user object that matches the JWT payload
        currentUser = {
            id: '67c20364cb5db58367558262', // MongoDB generated ID
            email: email,
            name: name || 'Charlie Runnels'
        };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // Reload the page to show the authenticated content
        window.location.reload();
    };

    // Format message with simple markdown-like syntax
    const formatMessage = (text) => {
        // Convert URLs to links
        text = text.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        // Convert **text** to <strong>text</strong>
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Convert _text_ to <em>text</em>
        text = text.replace(/_(.*?)_/g, '<em>$1</em>');
        
        // Handle lists
        const lines = text.split('\n');
        const formattedLines = [];
        let inList = false;
        
        for (let line of lines) {
            if (line.trim().startsWith('- ')) {
                if (!inList) {
                    formattedLines.push('<ul>');
                    inList = true;
                }
                formattedLines.push(`<li>${line.trim().substring(2)}</li>`);
            } else {
                if (inList) {
                    formattedLines.push('</ul>');
                    inList = false;
                }
                formattedLines.push(`<p>${line}</p>`);
            }
        }
        
        if (inList) {
            formattedLines.push('</ul>');
        }
        
        return formattedLines.join('');
    };
    
    // Create user message element
    const createUserMessage = (content) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const paragraph = document.createElement('p');
        paragraph.textContent = content;
        
        messageContent.appendChild(paragraph);
        messageDiv.appendChild(messageContent);
        
        return messageDiv;
    };
    
    // Create AI message element
    const createAIMessage = (content) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="#5046E5"/>
            </svg>
        `;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Handle simple markdown-style formatting for the AI message
        // Convert asterisks to bold, underscores to italics, and handle lists
        content = formatMessage(content);
        messageContent.innerHTML = content;
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);
        
        return messageDiv;
    };
    
    // Scroll chat to bottom
    const scrollToBottom = () => {
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    };
    
    // Create typing indicator element
    const createTypingIndicator = () => {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant typing';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="#5046E5"/>
            </svg>
        `;
        
        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(content);
        
        return typingDiv;
    };
    
    // Simple AI response simulation based on user input
    // In a real app, this would be replaced by an API call to a backend
    const simulateAIResponse = (userMessage) => {
        userMessage = userMessage.toLowerCase();
        console.log("⚠️ USING FALLBACK SIMULATION INSTEAD OF OPENAI API ⚠️");
        
        if (userMessage.includes('goal') || userMessage.includes('objective')) {
            return "[SIMULATED RESPONSE] Setting clear goals is important! Here are some tips for effective goal-setting:\n\n- Make your goals **specific and measurable**\n- Set **realistic timeframes**\n- Break large goals into smaller tasks\n- Track your progress regularly\n\nWould you like to add a new goal to your dashboard?";
        }
        
        if (userMessage.includes('hello') || userMessage.includes('hi') || userMessage.includes('hey')) {
            return "[SIMULATED RESPONSE] Hello! I'm your AI life coach and cofounder assistant. How can I help you today?";
        }
        
        if (userMessage.includes('startup') || userMessage.includes('business')) {
            return "[SIMULATED RESPONSE] Building a startup requires both vision and execution. Based on our previous discussions, I think you could focus on:\n\n- Validating your idea with potential customers\n- Creating a minimum viable product (MVP)\n- Establishing clear metrics for success\n- Planning your go-to-market strategy\n\nDo you want to discuss any of these areas in more detail?";
        }
        
        if (userMessage.includes('motivation') || userMessage.includes('stuck') || userMessage.includes('procrastinating')) {
            return "[SIMULATED RESPONSE] It sounds like you might be experiencing some challenges with motivation. This is completely normal! Here are some strategies that might help:\n\n- Start with just 5 minutes of work\n- Eliminate distractions in your environment\n- Use the Pomodoro technique (25 min work, 5 min break)\n- Remind yourself of your _why_ - the deeper reason behind your goals\n\nWould you like to discuss what might be causing your motivational challenges?";
        }
        
        return "[SIMULATED RESPONSE] I understand what you're saying. Could you tell me more about what you're thinking or feeling? I'm here to help with your goals and productivity, or just to listen if you need to process something.";
    };
    
    // Initialize chat by loading previous messages or creating welcome message
    const initializeChat = async () => {
        if (chatMessages) {
            // Clear existing messages
            chatMessages.innerHTML = '';
            
            try {
                if (currentChatId) {
                    // Load existing chat
                    const result = await apiRequest(`/chat/${currentChatId}`);
                    
                    if (result.success && result.session.messages.length > 0) {
                        // Add all messages to chat
                        result.session.messages.forEach(msg => {
                            if (msg.role === 'user') {
                                const userMsg = createUserMessage(msg.content);
                                chatMessages.appendChild(userMsg);
                            } else if (msg.role === 'assistant') {
                                const aiMsg = createAIMessage(msg.content);
                                chatMessages.appendChild(aiMsg);
                            }
                        });
                        
                        // Scroll to bottom
                        scrollToBottom();
                        return;
                    }
                }
            } catch (error) {
                console.error('Error loading chat:', error);
                // If error loading chat, continue to welcome message
            }
            
            // If no existing chat or error loading, show welcome message
            const welcomeMessage = createAIMessage(`👋 Hello${currentUser?.name ? ', ' + currentUser.name : ''}! I'm your AI life coach and cofounder assistant. I'm here to help you set and achieve your goals, track your progress, and provide personalized guidance.\n\nHow can I assist you today?`);
            chatMessages.appendChild(welcomeMessage);
        }
    };
    
    // Handle sending a message
    const sendMessage = async () => {
        if (!chatInput) return;
        
        const message = chatInput.value.trim();
        if (message === '') return;
        
        console.log('Sending message:', message);
        
        // Add user message to the chat
        const userMessageElement = createUserMessage(message);
        chatMessages.appendChild(userMessageElement);
        
        // Clear input
        chatInput.value = '';
        
        // Scroll to bottom
        scrollToBottom();
        
        try {
            // Show typing indicator
            const typingIndicator = createTypingIndicator();
            chatMessages.appendChild(typingIndicator);
            scrollToBottom();
            
            // Send message to API
            // In demo mode, we'll simulate the API response
            let response;
            let isSimulatedResponse = false;
            
            try {
                console.log('Sending message to API...');
                
                if (!currentChatId) {
                    console.log('No existing chat ID - creating new chat session');
                    // Create a new chat session
                    const result = await apiRequest('/chat', 'POST', {
                        initialMessage: message
                    });
                    
                    console.log('Create chat session result:', result);
                    
                    if (result.success) {
                        currentChatId = result.session.id;
                        localStorage.setItem('currentChatId', currentChatId);
                        
                        if (result.session.messages.length > 1 && result.session.messages[1].role === 'assistant') {
                            console.log('Using real API response from new chat');
                            response = result.session.messages[1].content;
                            
                            // Check if it's a fallback response from the server
                            if (result.openaiError || result.session.messages[1].metadata?.model === 'fallback') {
                                console.log('Server used fallback response');
                                isSimulatedResponse = true;
                            }
                        } else {
                            console.log('API response missing expected assistant message');
                            response = simulateAIResponse(message);
                            isSimulatedResponse = true;
                        }
                    } else {
                        console.log('API call failed, using simulation');
                        response = simulateAIResponse(message);
                        isSimulatedResponse = true;
                    }
                } else {
                    console.log('Using existing chat session:', currentChatId);
                    // Send message to existing chat session
                    const result = await apiRequest(`/chat/${currentChatId}/messages`, 'POST', {
                        message
                    });
                    
                    console.log('Send message result:', result);
                    
                    if (result.success && result.response && result.response.content) {
                        console.log('Using real API response');
                        response = result.response.content;
                        
                        // Check if it's a fallback response from the server
                        if (result.openaiError || result.response.metadata?.model === 'fallback') {
                            console.log('Server used fallback response');
                            isSimulatedResponse = true;
                        }
                    } else {
                        console.log('API call failed or incomplete response, using simulation');
                        response = simulateAIResponse(message);
                        isSimulatedResponse = true;
                    }
                }
            } catch (apiError) {
                console.error('API error in send message:', apiError);
                response = simulateAIResponse(message);
                isSimulatedResponse = true;
            }
            
            if (!isSimulatedResponse) {
                console.log('✓ REAL OPENAI RESPONSE RECEIVED ✓');
            }
            
            try {
                // Remove typing indicator
                chatMessages.removeChild(typingIndicator);
                
                // Add AI response to chat
                console.log("Creating AI message with response:", response?.substring(0, 50));
                const aiMessageElement = createAIMessage(response || "Error: No response received from AI. Please try again.");
                chatMessages.appendChild(aiMessageElement);
                
                // Add debug info in the UI
                const debugInfo = document.createElement('div');
                debugInfo.className = 'message system debug';
                debugInfo.style.fontSize = '10px';
                debugInfo.style.color = '#666';
                debugInfo.style.marginTop = '-10px';
                debugInfo.style.marginBottom = '10px';
                debugInfo.style.padding = '5px';
                
                let debugText = `Debug: ChatId=${currentChatId || 'none'}, UserId=${currentUser?.id || 'unknown'}, Simulation=${isSimulatedResponse}`;
                
                // Add API error message if one exists
                if (isSimulatedResponse) {
                    debugText += isSimulatedResponse ? 
                        ' - Using local fallback response due to API error' : 
                        ' - Using real OpenAI response';
                }
                
                debugInfo.textContent = debugText;
                chatMessages.appendChild(debugInfo);
            } catch (displayError) {
                console.error("Error displaying AI response:", displayError);
                const errorMsg = document.createElement('div');
                errorMsg.className = 'message system error';
                errorMsg.innerHTML = '<p>Error displaying AI response. See console for details.</p>';
                chatMessages.appendChild(errorMsg);
            }
            
            // Scroll to bottom again
            scrollToBottom();
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Fallback to simulation if there's an error
            const aiResponse = simulateAIResponse(message);
            const aiMessageElement = createAIMessage(aiResponse);
            chatMessages.appendChild(aiMessageElement);
            scrollToBottom();
        }
    };
  
    // Check authentication status and show login form if needed
    showLoginForm();
    
    // Set up chat functionality if authenticated
    if (chatInput && sendButton && isAuthenticated()) {
        // Initialize chat
        initializeChat();
        
        // Listen for send button click
        sendButton.addEventListener('click', sendMessage);
        
        // Listen for Enter key (but allow shift+enter for new lines)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Auto-resize textarea as user types
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
        });
    }
    
    // Goals page functionality
    const loadGoals = async () => {
        if (!goalsList || !isAuthenticated()) return;
        
        try {
            // Show loading state
            goalsList.innerHTML = '<div class="loading">Loading goals...</div>';
            
            // Get active tab for filtering
            const activeTab = document.querySelector('.tab-btn.active');
            const filter = activeTab ? activeTab.textContent.trim().toLowerCase() : 'all goals';
            
            // Build query parameters based on filter
            let queryParams = '';
            if (filter === 'in progress') {
                queryParams = '?status=in%20progress';
            } else if (filter === 'completed') {
                queryParams = '?status=completed';
            }
            
            // Get goals from API
            const result = await apiRequest(`/goals${queryParams}`);
            
            if (result.success && result.goals) {
                if (result.goals.length === 0) {
                    goalsList.innerHTML = `
                        <div class="empty-state">
                            <p>No goals found. Click "Add Goal" to create your first goal!</p>
                        </div>
                    `;
                    return;
                }
                
                // Clear goals list
                goalsList.innerHTML = '';
                
                // Add each goal
                result.goals.forEach(goal => {
                    const goalItem = createGoalItem(goal);
                    goalsList.appendChild(goalItem);
                });
            } else {
                // If API fails, show demo goals
                renderDemoGoals();
            }
        } catch (error) {
            console.error('Error loading goals:', error);
            // If error, show demo goals
            renderDemoGoals();
        }
    };
    
    // Create a goal item element
    const createGoalItem = (goal) => {
        const item = document.createElement('div');
        item.className = 'goal-item';
        item.dataset.goalId = goal._id || goal.id;
        
        // Determine status class
        const statusClass = goal.status === 'completed' ? 'completed' : 
                           goal.status === 'in progress' ? 'in-progress' : 'not-started';
        
        // Create progress percentage display
        const progressPercentage = goal.progress || 0;
        
        item.innerHTML = `
            <div class="goal-info">
                <div class="goal-status ${statusClass}"></div>
                <div class="goal-details">
                    <h3>${goal.title}</h3>
                    <p>${goal.description || ''}</p>
                    <div class="goal-metadata">
                        <span class="goal-category">${goal.category || 'Other'}</span>
                        ${goal.deadline ? `<span class="goal-deadline">Due ${new Date(goal.deadline).toLocaleDateString()}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="goal-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercentage}%"></div>
                </div>
                <span class="progress-text">${progressPercentage}%</span>
            </div>
            <button class="action-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M19 13C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11C18.4477 11 18 11.4477 18 12C18 12.5523 18.4477 13 19 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M5 13C5.55228 13 6 12.5523 6 12C6 11.4477 5.55228 11 5 11C4.44772 11 4 11.4477 4 12C4 12.5523 4.44772 13 5 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        `;
        
        // Add event listener for action button
        const actionBtn = item.querySelector('.action-btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', (e) => {
                const goalTitle = item.querySelector('h3').textContent;
                const goalId = item.dataset.goalId;
                
                showGoalActions(goalId, goalTitle, goal.status);
                e.stopPropagation();
            });
        }
        
        return item;
    };
    
    // Render demo goals if API is not available
    const renderDemoGoals = () => {
        if (!goalsList) return;
        
        const demoGoals = [
            {
                id: 'goal1',
                title: 'Launch Startup MVP',
                description: 'Create and launch a minimum viable product for my startup idea',
                category: 'career',
                status: 'in progress',
                progress: 45,
                deadline: new Date(Date.now() + 30*24*60*60*1000) // 30 days from now
            },
            {
                id: 'goal2',
                title: 'Learn Machine Learning',
                description: 'Complete online courses and build 2 practical projects',
                category: 'education',
                status: 'in progress',
                progress: 30
            },
            {
                id: 'goal3',
                title: 'Run 5K Race',
                description: 'Train and complete a 5K race under 25 minutes',
                category: 'health',
                status: 'completed',
                progress: 100,
                deadline: new Date(Date.now() - 5*24*60*60*1000) // 5 days ago
            }
        ];
        
        // Clear goals list
        goalsList.innerHTML = '';
        
        // Filter goals based on active tab
        const activeTab = document.querySelector('.tab-btn.active');
        const filter = activeTab ? activeTab.textContent.trim().toLowerCase() : 'all goals';
        
        let filteredGoals = demoGoals;
        if (filter === 'in progress') {
            filteredGoals = demoGoals.filter(g => g.status === 'in progress');
        } else if (filter === 'completed') {
            filteredGoals = demoGoals.filter(g => g.status === 'completed');
        }
        
        // Add each goal
        filteredGoals.forEach(goal => {
            const goalItem = createGoalItem(goal);
            goalsList.appendChild(goalItem);
        });
    };
    
    // Goal-related functions
    const showGoalActions = (goalId, goalTitle, currentStatus) => {
        // Create action menu (implementation continues as before)
    };
    
    // Setup goals page if we're on it
    if (goalTabs.length > 0 && isAuthenticated()) {
        // Initial load
        loadGoals();
        
        // Set up tab filtering
        goalTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs
                goalTabs.forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tab
                tab.classList.add('active');
                
                // Load goals with the new filter
                loadGoals();
            });
        });
    }
    
    // New chat button functionality
    const newChatBtn = document.querySelector('.new-chat-btn');
    
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            if (chatMessages) {
                // Clear all messages except the welcome message
                while (chatMessages.children.length > 1) {
                    chatMessages.removeChild(chatMessages.lastChild);
                }
                
                // Add a new welcome message if there are no messages left
                if (chatMessages.children.length === 0) {
                    const welcomeMessage = createAIMessage("👋 Hello! I'm your AI life coach and cofounder assistant. I'm here to help you set and achieve your goals, track your progress, and provide personalized guidance.\n\nHow can I assist you today?");
                    chatMessages.appendChild(welcomeMessage);
                }
            }
        });
    }
});