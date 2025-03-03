#!/bin/bash
# Test script for Racho AI application

echo -e "\033[1mRacho AI - Test Helper\033[0m"
echo "This script will check if the server is running and test the OpenAI integration."
echo

# Check if server is running
if curl -s http://localhost:3000/api/test > /dev/null; then
  echo -e "✅ \033[32mServer is running\033[0m"
else
  echo -e "❌ \033[31mServer is not running\033[0m - Starting it now..."
  echo
  echo "Opening a new terminal window to run the server..."
  osascript -e 'tell application "Terminal" to do script "cd '$(pwd)' && node server.js"' > /dev/null
  echo "Waiting for server to start..."
  sleep 3
  
  # Check again
  if curl -s http://localhost:3000/api/test > /dev/null; then
    echo -e "✅ \033[32mServer is now running\033[0m"
  else
    echo -e "❌ \033[31mCould not start server\033[0m - Please run 'node server.js' manually"
    exit 1
  fi
fi

echo
echo "What would you like to do?"
echo "1) Run API tests (checks OpenAI integration)"
echo "2) Open test page in browser"
echo "3) Open main application in browser"
echo "4) Exit"
echo "Enter your choice [1-4]: "
read choice

case $choice in
  1)
    echo "Running API tests..."
    echo 
    node test-api.js
    ;;
  2)
    echo "Opening test page in default browser..."
    open http://localhost:3000/test.html
    ;;
  3)
    echo "Opening main application in default browser..."
    open http://localhost:3000
    ;;
  4)
    echo "Exiting..."
    exit 0
    ;;
  *)
    echo "Invalid choice. Exiting..."
    exit 1
    ;;
esac

echo
echo -e "\033[1mDone!\033[0m"