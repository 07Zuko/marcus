# Racho AI Assistant - Installation Guide

This guide will help you set up and run the Racho AI Assistant application on your local machine.

## Prerequisites

Before you begin, make sure you have the following installed:

1. **Node.js** (v16 or later) - [Download from nodejs.org](https://nodejs.org/)
2. **MongoDB** - [Download from mongodb.com](https://www.mongodb.com/try/download/community)
3. **Git** - [Download from git-scm.com](https://git-scm.com/downloads)

You'll also need accounts with the following services:

1. **OpenAI** for GPT-4 API access - [Create an account](https://platform.openai.com/)
2. **Pinecone** for vector database - [Create an account](https://www.pinecone.io/)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/racho-ai-assistant.git
cd racho-ai-assistant
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and update it with your API keys:

```bash
cp .env.example .env
```

Open the `.env` file in your text editor and replace the placeholder values with your actual API keys:

```
# Required keys
OPENAI_API_KEY=your_actual_openai_api_key
PINECONE_API_KEY=your_actual_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment
PINECONE_INDEX=your_pinecone_index_name
JWT_SECRET=your_jwt_secret_key

# MongoDB connection (update if using a remote MongoDB instance)
MONGODB_URI=mongodb://localhost:27017/racho_ai
```

### 4. Set Up Pinecone Index

1. Log in to your Pinecone dashboard
2. Create a new index with the following settings:
   - Dimensions: 1536 (for OpenAI embeddings)
   - Metric: Cosine
   - Name: Choose a name (make sure it matches your PINECONE_INDEX in .env)

### 5. Start MongoDB

Make sure your MongoDB server is running:

```bash
# On Windows, if installed as a service, it should be running already
# On macOS/Linux, you might need to start it:
mongod --dbpath /path/to/data/directory
```

### 6. Run the Application

Start the development server:

```bash
npm run dev
```

The application should now be running at [http://localhost:3000](http://localhost:3000)

## Usage

1. Open your browser and navigate to [http://localhost:3000](http://localhost:3000)
2. Register a new account or log in
3. Start using the AI assistant features:
   - Chat with the AI assistant
   - Create and track goals
   - Manage tasks
   - Log activities
   - View AI-generated insights

## Configuration Options

### OpenAI Model Selection

You can change the OpenAI model used by the application by modifying the `openaiService.js` file. The default is set to GPT-4:

```javascript
// In api/services/openaiService.js
const completion = await openai.chat.completions.create({
  model: 'gpt-4-turbo', // Change this to 'gpt-3.5-turbo' for a more affordable option
  // ... other options
});
```

### Authentication Settings

You can modify authentication settings in the `authController.js` file, such as token expiration time:

```javascript
// In api/controllers/authController.js
const token = jwt.sign(
  { id: user._id }, 
  config.JWT_SECRET,
  { expiresIn: '30d' } // Change this for different token expiration
);
```

## Troubleshooting

### API Connection Issues

- Verify that your API keys are correct in the `.env` file
- Check that you have proper internet connectivity
- Ensure you have sufficient quota/credits in your OpenAI account

### Database Issues

- Make sure MongoDB is running
- Check the MongoDB connection string in your `.env` file
- If you're using a remote MongoDB instance, ensure your IP is whitelisted

## Production Deployment

For production deployment, consider:

1. Using environment variables for configuration instead of `.env` files
2. Setting up proper security measures (HTTPS, rate limiting, etc.)
3. Implementing a robust backup strategy for your MongoDB database
4. Using a process manager like PM2 to keep your Node.js application running

```bash
# Install PM2
npm install -g pm2

# Start the application with PM2
pm2 start server.js --name "racho-ai"
```