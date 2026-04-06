# 🚀 Quick Start Guide - Docker Hub Deployment

## 📋 Pre-Deployment Checklist

- [ ] Docker Hub account created
- [ ] Ubuntu server accessible via SSH (can be same or separate server for generator API)
- [ ] Domain name configured (optional)
- [ ] MongoDB database ready (Atlas or self-hosted)
- [ ] Google API Key for Generator API (get from https://console.cloud.google.com/)

**📌 Note:** The Generator API (Python) runs separately. See `GENERATOR_API_DEPLOYMENT.md` for details.

---

## ⚡ Quick Commands

### 1. Build and Push Images (Local)
```bash
cd /Users/rayenbenslimen/.codex/worktrees/226e/Looksmax/Looksmaxtn
./build-push.sh your-dockerhub-username
```

### 2. Deploy to Ubuntu Server (Server)
```bash
ssh user@your-server-ip
cd /var/www/looksmax
./deploy.sh your-dockerhub-username
```

### 3. Update and Redeploy
```bash
# Local - Build and push changes
./build-push.sh your-dockerhub-username

# Server - Pull and restart
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## 🔧 Environment Variables Setup

### Step 1: Create Environment Files from Templates
```bash
# Backend
cp back/.env.production.template back/.env.production
# Edit the file and replace placeholder values

# Admin
cp admin/.env.production.template admin/.env.production
# Edit the file and replace placeholder values

# Frontend
cp front/.env.production.template front/.env.production
# Edit the file and replace placeholder values
```

### Step 2: Key Variables to Update

#### Backend (.env.production)
```env
# Update these with your values:
MONGODB_URI=mongodb://your-mongodb-host:27017/looksmax-production
BACKEND_BASE_URL=https://yourdomain.com
FRONTEND_BASE_URL=https://yourdomain.com

# Generator API URLs - Update based on your setup:
# Same server: http://localhost:8000
# Different server: http://your-generator-server-ip:8000
# With domain: https://generator.yourdomain.com
PRODUCT_GENERATION_URL_BASE=http://your-generator-server-ip:8000/
ADMIN_IMAGE_GENERATION_URL_BASE=http://your-generator-server-ip:8000

OUTFIT_WEBHOOK_BASE_URL=https://yourdomain.com
OUTFIT_WEBHOOK_SECRET=your-secure-random-string
JWT_SECRET=your-secure-random-string
```

#### Admin (.env.production)
```env
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
NEXT_PUBLIC_FRONTEND_URL=https://yourdomain.com
```

#### Frontend (.env.production)
```env
NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
NEXT_PUBLIC_ADMIN_URL=https://admin.yourdomain.com
```

---

## 🌐 One-Time Server Setup

### 1. SSH to Server
```bash
ssh user@your-server-ip
```

### 2. Install Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo apt install docker-compose -y
```

### 3. Create Project Directory
```bash
sudo mkdir -p /var/www/looksmax
sudo chown $USER:$USER /var/www/looksmax
cd /var/www/looksmax
```

### 4. Copy Files to Server
```bash
# From your local machine
scp -r docker-compose.prod.yml deploy.sh user@your-server-ip:/var/www/looksmax/
```

### 5. Login to Docker Hub
```bash
docker login
```

### 6. Deploy
```bash
./deploy.sh your-dockerhub-username
```

---

## 📊 Common Operations

### View Logs
```bash
docker-compose -f docker-compose.prod.yml logs -f
docker-compose -f docker-compose.prod.yml logs -f back
```

### Restart Services
```bash
docker-compose -f docker-compose.prod.yml restart
docker-compose -f docker-compose.prod.yml restart back
```

### Check Status
```bash
docker-compose -f docker-compose.prod.yml ps
```

### Stop All Services
```bash
docker-compose -f docker-compose.prod.yml down
```

### Update Environment Variables
```bash
# Edit env file
nano env/back/.env

# Restart service
docker-compose -f docker-compose.prod.yml up -d --force-recreate back
```

### Database Backup
```bash
# Backup
docker exec looksmax-mongodb mongodump --archive=/data/db/backup-$(date +%Y%m%d).gz
docker cp looksmax-mongodb:/data/db/backup-$(date +%Y%m%d).gz ./backups/

# Restore
docker cp ./backups/backup-20240406.gz looksmax-mongodb:/data/db/backup.gz
docker exec looksmax-mongodb mongorestore --archive=/data/db/backup.gz
```

---

## 🔄 Development Workflow

### 1. Make Code Changes
```bash
# Edit your code locally
cd /Users/rayenbenslimen/.codex/worktrees/226e/Looksmax/Looksmaxtn
```

### 2. Test Locally
```bash
npm run dev  # in respective project directories
```

### 3. Build and Push
```bash
./build-push.sh your-dockerhub-username
```

### 4. Deploy to Server
```bash
ssh user@your-server-ip
cd /var/www/looksmax
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## 🔒 Security Tips

### 1. Generate Secure Secrets
```bash
# Generate random strings for secrets
openssl rand -base64 32
```

### 2. Set Up Firewall
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 3. Use SSL/TLS
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d admin.yourdomain.com
```

### 4. MongoDB Security
```bash
# Use MongoDB Atlas for cloud security
# Or set up authentication for self-hosted MongoDB
```

---

## 🚨 Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs -f [service-name]

# Check disk space
df -h
docker system df

# Clean up if needed
docker system prune -a
```

### Database Connection Issues
```bash
# Test MongoDB connection
docker exec -it looksmax-mongodb mongosh

# Check network
docker network inspect looksmax_looksmax-network
```

### Environment Variables Not Loading
```bash
# Verify file exists
ls -la env/back/.env

# Check permissions
chmod 644 env/back/.env

# Verify content
cat env/back/.env
```

### Port Conflicts
```bash
# Check what's using ports
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3003
sudo netstat -tulpn | grep :3004

# Stop conflicting services
sudo systemctl stop nginx  # if needed
```

---

## 📞 Getting Help

1. **Check logs first**: `docker-compose -f docker-compose.prod.yml logs -f`
2. **Verify environment variables**: `cat env/back/.env`
3. **Test connectivity**: `curl http://localhost:3004/api/health`
4. **Check Docker status**: `docker ps -a`
5. **Review documentation**: See `DEPLOYMENT_GUIDE.md` for detailed instructions

---

## 🎯 URLs After Deployment

- **Frontend**: http://localhost:3000 or https://yourdomain.com
- **Admin Panel**: http://localhost:3003 or https://admin.yourdomain.com
- **Backend API**: http://localhost:3004/api or https://yourdomain.com/api
- **MongoDB**: mongodb://localhost:27017

---

## ✅ Success Indicators

After deployment, check:
- [ ] All containers show "Up" status in `docker-compose ps`
- [ ] No errors in logs (`docker-compose logs -f`)
- [ ] Frontend loads in browser
- [ ] Admin panel loads in browser
- [ ] Backend API responds to health checks
- [ ] MongoDB connection successful

---

## 📈 Monitoring

### Basic Monitoring
```bash
# Container status
docker-compose -f docker-compose.prod.yml ps

# Resource usage
docker stats

# Disk usage
df -h

# Memory usage
free -h
```

### Log Monitoring
```bash
# Follow all logs
docker-compose -f docker-compose.prod.yml logs -f

# Specific service logs
docker-compose -f docker-compose.prod.yml logs -f back

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100
```

---

## 🎉 You're All Set!

Your LooksmaxTN application is now containerized and ready for deployment to your Ubuntu server using Docker Hub!

For detailed information, see the main `DEPLOYMENT_GUIDE.md` file.
