#!/bin/bash

# Build script for UrDashboard Docker image

set -e

IMAGE_NAME="urdashboard"
IMAGE_TAG="latest"

echo "========================================="
echo "Building UrDashboard Docker Image"
echo "========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo "Error: Dockerfile not found in current directory"
    exit 1
fi

# Create requirements.txt if it doesn't exist
if [ ! -f "requirements.txt" ]; then
    echo "Creating requirements.txt..."
    cat > requirements.txt << 'EOF'
sanic
jinja2
requests
tenacity
aiohttp
urllib3
EOF
    echo "requirements.txt created"
fi

echo "Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""

# Build the Docker image
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "Build completed successfully!"
    echo "========================================="
    echo ""
    echo "Run with persistent data volume:"
    echo "  docker run -d -p 8080:8080 -v /etc/_urdashboard/data:/app/data --name urdashboard ${IMAGE_NAME}:${IMAGE_TAG}"
    echo ""
    echo "Make sure host directory exists before running:"
    echo "  sudo mkdir -p /etc/_urdashboard/data"
    echo ""
else
    echo ""
    echo "========================================="
    echo "Build failed!"
    echo "========================================="
    exit 1
fi
