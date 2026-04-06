#!/bin/bash

# Build and Push Docker Images to Docker Hub
# Usage: ./build-push.sh [your-dockerhub-username]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get Docker Hub username
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide your Docker Hub username${NC}"
    echo "Usage: ./build-push.sh your-dockerhub-username"
    exit 1
fi

USERNAME=$1
VERSION=${2:-latest}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}LooksmaxTN Docker Build & Push Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if user is logged in to Docker Hub
echo -e "${GREEN}Checking Docker Hub login status...${NC}"
if ! docker info | grep -q "Username"; then
    echo -e "${RED}Not logged in to Docker Hub. Please login first:${NC}"
    echo "docker login"
    exit 1
fi
echo -e "${GREEN}✓ Logged in as $USERNAME${NC}"
echo ""

# Function to build and push image
build_and_push() {
    local service=$1
    local image_name="${USERNAME}/looksmax-${service}:${VERSION}"

    echo -e "${BLUE}Building ${service}...${NC}"
    docker build -t "${image_name}" "./${service}"

    echo -e "${BLUE}Pushing ${service}...${NC}"
    docker push "${image_name}"

    echo -e "${GREEN}✓ ${service} built and pushed successfully${NC}"
    echo ""
}

# Build and push all services
build_and_push "back"
build_and_push "admin"
build_and_push "front"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All images built and pushed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Images pushed as:"
echo "  - ${USERNAME}/looksmax-back:${VERSION}"
echo "  - ${USERNAME}/looksmax-admin:${VERSION}"
echo "  - ${USERNAME}/looksmax-front:${VERSION}"
echo ""
echo "Next steps:"
echo "1. SSH to your server: ssh user@your-server-ip"
echo "2. Pull images: docker-compose pull"
echo "3. Restart services: docker-compose up -d --force-recreate"
