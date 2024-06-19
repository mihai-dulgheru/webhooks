#!/bin/bash

# Start the Node.js server using nohup and redirect logs to server.log
nohup npm run start >./server.log 2>&1 &

# Print the PID of the started process
echo "Server started with PID $!"
