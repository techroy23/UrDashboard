#!/bin/bash

echo "Starting Sanic Server with Hypercorn..."

while true; do
    python3 server.py
    if [ $? -ne 0 ]; then
        echo ""
        echo "Server failed to start. Restarting in 5 seconds..."
        sleep 5
    else
        # If server exits cleanly (e.g. user stopped it), break loop
        break
    fi
done
