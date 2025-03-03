# Aurelius AI Assistant

A GPT-Powered Life Coach & Cofounder AI Assistant that helps users with personal development, goal tracking, task management, and productivity.

## New: Multi-Layer AI Architecture
This project recently implemented a more robust multi-layer AI architecture that improves:
- Goal creation through natural conversation
- Context preservation across interactions
- Smart detection of user intents
- More natural conversational flows

## Features

- **Chat Interface**: Conversational AI assistant powered by GPT-4
- **Goal Tracking**: Create, manage, and track personal and professional goals
- **Task Management**: Break down goals into actionable tasks
- **Activity Logs**: Track activities and mood
- **AI Insights**: Generate personalized insights based on logs and goals
- **Long-term Memory**: Conversation history and context stored in vector database

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Database**: MongoDB
- **AI Integration**: OpenAI GPT-4 API
- **Vector Storage**: Pinecone
- **Authentication**: JWT

## Setup Instructions

### Prerequisites

- Node.js (v16+)
- MongoDB
- OpenAI API key
- Pinecone API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/charlieradford/testing.git
   cd testing
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure API keys:
   - Copy the example config file: `cp api/config.js.example api/config.js`
   - Update `api/config.js` with your OpenAI API key and other credentials
   - The OpenAI API key must be a valid key that starts with "sk-"
   - Without a valid OpenAI API key, the app will use fallback responses
   - The config.js file is already in `.gitignore` to protect your API keys

4. Set up MongoDB:
   - Create a MongoDB database
   - Update the connection string in `config.js`

5. Set up Pinecone:
   - Create a Pinecone index with 1536 dimensions (for OpenAI embeddings)
   - Update the Pinecone configuration in `config.js`

6. Start the development server:
   ```bash
   node server.js
   ```

7. Access the application at `http://localhost:3000`

8. Test the API and OpenAI integration:
   ```bash
   # Run the interactive test script
   ./open-test.sh
   
   # Or run the API tests directly
   node test-api.js
   ```

9. Debug mode:
   - Check the debug files in the `debug/` directory
   - Use `simple-chat.html` to test chat functionality directly
   - Use `openai-test.html` to test OpenAI API directly

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/profile` - Get user profile

### Chat
- `GET /api/chat` - Get all chat sessions
- `POST /api/chat` - Create a new chat session
- `GET /api/chat/:id` - Get a specific chat session
- `POST /api/chat/:id/messages` - Send a message in a chat session
- `DELETE /api/chat/:id` - Delete a chat session

### Goals
- `GET /api/goals` - Get all goals
- `POST /api/goals` - Create a new goal
- `GET /api/goals/:id` - Get a specific goal
- `PUT /api/goals/:id` - Update a goal
- `DELETE /api/goals/:id` - Delete a goal
- `GET /api/goals/:id/analysis` - Get AI analysis for a goal

### Tasks
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create a new task
- `GET /api/tasks/:id` - Get a specific task
- `PUT /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task

### Logs
- `GET /api/logs` - Get all logs
- `POST /api/logs` - Create a new log
- `GET /api/logs/:id` - Get a specific log
- `PUT /api/logs/:id` - Update a log
- `DELETE /api/logs/:id` - Delete a log

### Insights
- `GET /api/insights/generate` - Generate insights from user data
- `GET /api/insights/analytics` - Get analytics data for dashboard

## Frontend Pages

- **index.html** - Main chat interface
- **goals.html** - Goal tracking and management
- **tasks.html** - Task management interface
- **logs.html** - Activity and mood logging
- **insights.html** - AI-generated insights and analytics dashboard

## Usage

1. Register an account or log in
2. Use the chat interface to talk with Marcus AI
3. Create goals and break them down into tasks
4. Log your activities and mood
5. Review insights generated from your data

## Troubleshooting

### OpenAI API Issues
- If you see "Using fallback response" in the logs, your OpenAI API key is invalid or missing
- Make sure your API key starts with "sk-" (not "sk-proj-" which is a Claude/Anthropic format)
- Check that your API key has sufficient quota and is not expired
- Run the test script (`./open-test.sh`) to diagnose API issues

### MongoDB Connection Issues
- Check that MongoDB is running locally or your connection string is correct
- The app will work in fallback mode for static files even without MongoDB
- If you see "Database error" in the logs, check your MongoDB setup

### General Issues
- Check browser console for JavaScript errors
- Check server logs for backend errors
- Use the debug tools in `/debug` directory to test components individually

## Future Improvements

- Mobile application
- Calendar integration
- More third-party integrations (Notion, Slack, etc.)
- Voice interface
- Enhanced analytics
- Offline support

## License

MIT License