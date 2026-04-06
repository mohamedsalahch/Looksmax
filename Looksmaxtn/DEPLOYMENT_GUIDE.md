# 🚀 LooksmaxTN Deployment Guide to Ubuntu Server using Docker Hub

## 📋 Prerequisites
- Docker Hub account (https://hub.docker.com/)
- Ubuntu server with SSH access (can be same or separate server for generator API)
- Domain name (optional but recommended)
- Google API Key for Generator API (get from https://console.cloud.google.com/)
- Basic knowledge of terminal/SSH

**📌 Note:** The Generator API (Python) runs separately from the main 3 projects. See `GENERATOR_API_DEPLOYMENT.md` for detailed generator API setup.

---

## 🔧 STEP 1: Set Up Environment Variables

### 1.1 Backend Environment Variables (back/.env)
Create `back/.env.production` file:

```env
# MongoDB Connection (Update with your production MongoDB)
MONGODB_URI=mongodb://your-mongodb-host:27017/looksmax-production

# API URLs (Update with your domain or server IP)
BACKEND_BASE_URL=https://yourdomain.com
FRONTEND_BASE_URL=https://yourdomain.com
ADMIN_BASE_URL=https://admin.yourdomain.com

# External Services - Generator API URLs
# If running on same server: http://localhost:8000
# If running on separate server: http://your-generator-server-ip:8000
# If using domain: https://generator.yourdomain.com
PRODUCT_GENERATION_URL_BASE=http://your-generator-server-ip:8000/
ADMIN_IMAGE_GENERATION_URL_BASE=http://your-generator-server-ip:8000
OUTFIT_WEBHOOK_BASE_URL=https://yourdomain.com

# Security
OUTFIT_WEBHOOK_SECRET=your-secret-webhook-key-here
JWT_SECRET=your-jwt-secret-here

# Node Environment
NODE_ENV=production
```

### 1.2 Admin Environment Variables (admin/.env)
Create `admin/.env.production` file:

```env
# API URLs
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
NEXT_PUBLIC_FRONTEND_URL=https://yourdomain.com

# Node Environment
NODE_ENV=production
```

### 1.3 Frontend Environment Variables (front/.env)
Create `front/.env.production` file:

```env
# API URLs
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
NEXT_PUBLIC_ADMIN_URL=https://admin.yourdomain.com

# Node Environment
NODE_ENV=production
```

**📝 Important Notes:**
- Replace `yourdomain.com` with your actual domain or server IP
- For MongoDB, you can use:
  - MongoDB Atlas (cloud)
  - Self-hosted MongoDB on your server
  - Docker MongoDB container

---

## 🐳 STEP 2: Set Up Docker Hub

### 2.1 Create Docker Hub Account
1. Go to https://hub.docker.com/
2. Sign up and verify your email
3. Create a repository for each project:
   - `yourusername/looksmax-back`
   - `yourusername/looksmax-admin`
   - `yourusername/looksmax-front`

### 2.2 Login to Docker Hub (Local Machine)
```bash
docker login
```
Enter your Docker Hub username and password.

---

## 🏗️ STEP 3: Build and Push Images to Docker Hub

### 3.1 Build Images (Run from project root)
```bash
cd /Users/rayenbenslimen/.codex/worktrees/226e/Looksmax/Looksmaxtn

# Build all images
docker build -t yourusername/looksmax-back:latest ./back
docker build -t yourusername/looksmax-admin:latest ./admin
docker build -t yourusername/looksmax-front:latest ./front
```

### 3.2 Tag Images with Version (Optional but Recommended)
```bash
docker tag yourusername/looksmax-back:latest yourusername/looksmax-back:v1.0.0
docker tag yourusername/looksmax-admin:latest yourusername/looksmax-admin:v1.0.0
docker tag yourusername/looksmax-front:latest yourusername/looksmax-front:v1.0.0
```

### 3.3 Push Images to Docker Hub
```bash
# Push latest versions
docker push yourusername/looksmax-back:latest
docker push yourusername/looksmax-admin:latest
docker push yourusername/looksmax-front:latest

# Push versioned images (if tagged)
docker push yourusername/looksmax-back:v1.0.0
docker push yourusername/looksmax-admin:v1.0.0
docker push yourusername/looksmax-front:v1.0.0
```

---

## 🖥️ STEP 4: Prepare Ubuntu Server

### 4.1 Connect to Ubuntu Server
```bash
ssh user@your-server-ip
```

### 4.2 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 4.3 Install Docker and Docker Compose
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose -y

# Enable Docker to start on boot
sudo systemctl enable docker
sudo systemctl start docker
```

### 4.4 Login to Docker Hub on Server
```bash
docker login
```
Enter your Docker Hub credentials.

---

## 📁 STEP 5: Create Project Directory on Server

```bash
# Create project directory
sudo mkdir -p /var/www/looksmax
sudo chown $USER:$USER /var/www/looksmax
cd /var/www/looksmax

# Create subdirectories
mkdir -p env/back env/admin env/front
```

---

## 🔐 STEP 6: Set Up Environment Variables on Server

### 6.1 Backend Environment File
```bash
nano env/back/.env
```

Paste your backend environment variables:
```env
MONGODB_URI=mongodb://localhost:27017/looksmax-production
BACKEND_BASE_URL=https://yourdomain.com
FRONTEND_BASE_URL=https://yourdomain.com
PRODUCT_GENERATION_URL_BASE=http://localhost:8000/
ADMIN_IMAGE_GENERATION_URL_BASE=http://localhost:8000
OUTFIT_WEBHOOK_BASE_URL=https://yourdomain.com
OUTFIT_WEBHOOK_SECRET=your-secret-webhook-key-here
JWT_SECRET=your-jwt-secret-here
NODE_ENV=production
```

### 6.2 Admin Environment File
```bash
nano env/admin/.env
```

Paste your admin environment variables:
```env
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
NEXT_PUBLIC_FRONTEND_URL=https://yourdomain.com
NODE_ENV=production
```

### 6.3 Frontend Environment File
```bash
nano env/front/.env
```

Paste your frontend environment variables:
```env
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
NEXT_PUBLIC_ADMIN_URL=https://admin.yourdomain.com
NODE_ENV=production
```

---

## 🐳 STEP 7: Create Docker Compose File on Server

```bash
nano docker-compose.yml
```

Paste the following configuration:

```yaml
version: '3.8'

services:
  # MongoDB Database
  mongodb:
    image: mongo:7
    container_name: looksmax-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=looksmax-production
    networks:
      - looksmax-network

  # Backend API
  back:
    image: yourusername/looksmax-back:latest
    container_name: looksmax-back
    restart: unless-stopped
    ports:
      - "3004:3004"
    env_file:
      - ./env/back/.env
    depends_on:
      - mongodb
    networks:
      - looksmax-network

  # Admin Panel
  admin:
    image: yourusername/looksmax-admin:latest
    container_name: looksmax-admin
    restart: unless-stopped
    ports:
      - "3003:3003"
    env_file:
      - ./env/admin/.env
    depends_on:
      - back
    networks:
      - looksmax-network

  # Frontend Storefront
  front:
    image: yourusername/looksmax-front:latest
    container_name: looksmax-front
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - ./env/front/.env
    depends_on:
      - back
    networks:
      - looksmax-network

networks:
  looksmax-network:
    driver: bridge

volumes:
  mongodb_data:
```

**🔑 Important:** Replace `yourusername` with your actual Docker Hub username.

---

## 🚀 STEP 8: Deploy to Ubuntu Server

### 8.1 Pull Images and Start Containers
```bash
cd /var/www/looksmax

# Pull latest images
docker-compose pull

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

### 8.2 View Logs
```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f back
docker-compose logs -f admin
docker-compose logs -f front
docker-compose logs -f mongodb
```

---

## 🔄 STEP 9: Update and Redeploy Workflow

When you need to update your application:

### 9.1 On Your Local Machine
```bash
cd /Users/rayenbenslimen/.codex/worktrees/226e/Looksmax/Looksmaxtn

# Update code
git pull origin main

# Rebuild and push new images
docker build -t yourusername/looksmax-back:latest ./back
docker build -t yourusername/looksmax-admin:latest ./admin
docker build -t yourusername/looksmax-front:latest ./front

docker push yourusername/looksmax-back:latest
docker push yourusername/looksmax-admin:latest
docker push yourusername/looksmax-front:latest
```

### 9.2 On Ubuntu Server
```bash
cd /var/www/looksmax

# Pull new images
docker-compose pull

# Restart services with new images
docker-compose up -d --force-recreate

# Check status
docker-compose ps
docker-compose logs -f
```

---

## 🌐 STEP 10: Set Up Reverse Proxy with Nginx (Optional but Recommended)

### 10.1 Install Nginx
```bash
sudo apt install nginx -y
```

### 10.2 Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/looksmax
```

Paste the following configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name admin.yourdomain.com;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 10.3 Enable Site and Restart Nginx
```bash
sudo ln -s /etc/nginx/sites-available/looksmax /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔒 STEP 11: Set Up SSL with Let's Encrypt (Optional but Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificates
sudo certbot --nginx -d yourdomain.com -d admin.yourdomain.com

# Auto-renewal is set up automatically
```

---

## 📊 Monitoring and Management

### Check Container Status
```bash
docker-compose ps
```

### View Resource Usage
```bash
docker stats
```

### Restart Specific Service
```bash
docker-compose restart back
```

### Stop All Services
```bash
docker-compose down
```

### Backup MongoDB Data
```bash
docker exec looksmax-mongodb mongodump --archive=/data/db/backup-$(date +%Y%m%d).gz
docker cp looksmax-mongodb:/data/db/backup-$(date +%Y%m%d).gz ./backups/
```

---

## 🚨 Troubleshooting

### Check Logs
```bash
docker-compose logs -f [service-name]
```

### Restart Container
```bash
docker-compose restart [service-name]
```

### Rebuild and Restart
```bash
docker-compose up -d --force-recreate [service-name]
```

### Check Disk Space
```bash
df -h
docker system df
```

### Clean Up Unused Docker Resources
```bash
docker system prune -a
```

---

## 🎯 Quick Reference Commands

```bash
# Build and push images
docker build -t yourusername/looksmax-back:latest ./back
docker push yourusername/looksmax-back:latest

# Deploy to server
ssh user@server
cd /var/www/looksmax
docker-compose pull
docker-compose up -d

# Update environment variables
nano env/back/.env
docker-compose up -d --force-recreate back

# Check logs
docker-compose logs -f
```

---

## 📞 Support

If you encounter any issues:
1. Check Docker logs: `docker-compose logs -f`
2. Verify environment variables: `cat env/back/.env`
3. Check MongoDB connection: `docker exec -it looksmax-mongodb mongosh`
4. Test API endpoints: `curl http://localhost:3004/api/health`

---

## 🎉 Deployment Complete!

Your LooksmaxTN application is now deployed and running on your Ubuntu server!
