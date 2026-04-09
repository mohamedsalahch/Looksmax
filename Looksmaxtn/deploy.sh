#!/bin/bash

# Deploy script for Ubuntu Server
# Usage: ./deploy.sh

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}LooksmaxTN Deployment Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}Checking production environment files...${NC}"

for env_file in back/.env.production admin/.env.production front/.env.production generator_api/.env.production; do
    if [ ! -f "$env_file" ]; then
        echo -e "${RED}Missing required file: $env_file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓ All production environment files found${NC}"
echo ""

# Pull images
echo -e "${GREEN}Pulling Docker images...${NC}"
docker-compose -f docker-compose.prod.yml pull
echo -e "${GREEN}✓ Images pulled successfully${NC}"
echo ""

# Start services
echo -e "${GREEN}Starting services...${NC}"
docker-compose -f docker-compose.prod.yml up -d
echo -e "${GREEN}✓ Services started successfully${NC}"
echo ""

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Show status
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Container Status${NC}"
echo -e "${BLUE}========================================${NC}"
docker-compose -f docker-compose.prod.yml ps
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Your applications are now running:"
echo "  - Frontend: http://51.75.126.19:12000"
echo "  - Admin:    http://51.75.126.19:12001"
echo "  - Backend:  http://51.75.126.19:12002"
echo "  - Python:   http://51.75.126.19:12003"
echo "  - MongoDB:  localhost:27017"
echo ""
echo "View logs with: docker-compose -f docker-compose.prod.yml logs -f"
