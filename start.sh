#!/bin/bash

# Navigate to the webhooks directory
cd /var/www/demo.chesscoders.com/webhooks

# Start the Node.js server using nohup and redirect logs to server.log
nohup npm run start-server > /var/www/demo.chesscoders.com/webhooks/server.log 2>&1 &

# Print the PID of the started process
echo "Server started with PID $!"
