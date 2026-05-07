# LooksmaxTN MongoDB Backup And Restore

Backups must be tested before production launch and before MongoDB image upgrades.

## Backup

Run from the host that owns the production Docker volumes:

```sh
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongodump --archive --gzip --db looksmax-production \
  > "backups/looksmax-production-$(date +%Y%m%d-%H%M%S).archive.gz"
```

Copy the archive to encrypted off-host storage after each backup. Keep at least daily backups for 14 days and one monthly backup for 12 months.

## Restore Drill

Restore only into a non-production environment unless this is an incident restore:

```sh
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongorestore --archive --gzip --drop \
  < backups/looksmax-production-YYYYMMDD-HHMMSS.archive.gz
```

After restore, verify that users, products, orders, coupons, and generated-image jobs can be read from the application.

## Upgrade Procedure

1. Take a fresh backup.
2. Restore it into a staging volume.
3. Start the app stack against staging MongoDB.
4. Run app lint, typecheck, tests, build, and a smoke checkout.
5. Upgrade production only after the staging restore and smoke test pass.
