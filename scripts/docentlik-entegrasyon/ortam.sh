#!/bin/bash
# DOÇENTLİK PR7 — YEREL, İZOLE, SENTETİK ENTEGRASYON YIĞINI.
# Yalnızca bu makinedeki docker kapsayıcıları (pr7db, pr7auth, pr7storage, pr7rest, pr7rest300)
# ve 127.0.0.1. Canlı ya da paylaşılan Test Supabase'e BAĞLANMAZ; gerçek veri kullanmaz.
# Parolalar ve JWT sırrı yalnızca yerel prova içindir, hiçbir ortamda geçerli değildir.
#
# Kullanım: scripts/docentlik-entegrasyon/ortam.sh <çalışma-dizini>
#   Sonra: npm run test:entegrasyon ve (next build + next start sonrası)
#          node scripts/docentlik-entegrasyon/tarayici-kabul.mjs
set -euo pipefail
D="${1:?kullanım: ortam.sh <çalışma-dizini>}"; mkdir -p "$D"
KOK="$(cd "$(dirname "$0")/../.." && pwd)"
SIR=pr7-yerel-jwt-gizli-degil-yalnizca-sentetik-0123456789
PGU="postgres://postgres:pr7-yerel@127.0.0.1:55433/postgres"
docker info >/dev/null 2>&1 || { (dockerd > "$D/dockerd.log" 2>&1 &); for i in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done; }
node -e 'const c=require("crypto"),[s,r]=process.argv.slice(1),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url"),g=b({alg:"HS256",typ:"JWT"})+"."+b({role:r,iss:"pr7-yerel",iat:1763200000,exp:2079000000});console.log(g+"."+c.createHmac("sha256",s).update(g).digest("base64url"))' $SIR anon > "$D/anon.key"
node -e 'const c=require("crypto"),[s,r]=process.argv.slice(1),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url"),g=b({alg:"HS256",typ:"JWT"})+"."+b({role:r,iss:"pr7-yerel",iat:1763200000,exp:2079000000});console.log(g+"."+c.createHmac("sha256",s).update(g).digest("base64url"))' $SIR service_role > "$D/service.key"
docker network create pr7ag >/dev/null 2>&1 || true
docker rm -f pr7rest pr7rest300 pr7storage pr7auth pr7db >/dev/null 2>&1 || true
docker run -d --name pr7db --network pr7ag -e POSTGRES_PASSWORD=pr7-yerel -p 55433:5432 postgres:17 -c max_connections=200 >/dev/null
for i in $(seq 1 40); do psql "$PGU" -c "select 1" >/dev/null 2>&1 && break; sleep 1; done
psql "$PGU" -v ON_ERROR_STOP=1 -q -f "$KOK/scripts/docentlik-entegrasyon/roller.sql"
docker run -d --name pr7auth --network pr7ag -p 59998:9999 \
 -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54400/auth/v1 \
 -e GOTRUE_DB_DRIVER=postgres -e DATABASE_URL="postgres://supabase_auth_admin:pr7-yerel@pr7db:5432/postgres?search_path=auth&sslmode=disable" \
 -e GOTRUE_SITE_URL=http://localhost:3100 -e GOTRUE_URI_ALLOW_LIST="http://localhost:3100/**" \
 -e GOTRUE_JWT_SECRET=$SIR -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
 -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
 -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_PASSWORD_MIN_LENGTH=6 \
 -e GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 supabase/gotrue:v2.197.0 >/dev/null
docker run -d --name pr7storage --network pr7ag -p 55000:5000 \
 -e ANON_KEY="$(cat "$D/anon.key")" -e SERVICE_KEY="$(cat "$D/service.key")" -e AUTH_JWT_SECRET=$SIR -e PGRST_JWT_SECRET=$SIR \
 -e DATABASE_URL="postgres://supabase_storage_admin:pr7-yerel@pr7db:5432/postgres" \
 -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage -e TENANT_ID=stub -e REGION=stub -e GLOBAL_S3_BUCKET=stub \
 -e FILE_SIZE_LIMIT=52428800 -e DB_INSTALL_ROLES=false -e ENABLE_IMAGE_TRANSFORMATION=false supabase/storage-api:v1.19.3 >/dev/null
for i in $(seq 1 60); do curl -s --noproxy '*' http://127.0.0.1:59998/health | grep -q version && curl -s --noproxy '*' -o /dev/null -w "%{http_code}" http://127.0.0.1:55000/status | grep -q 200 && break; sleep 1; done
psql "$PGU" -v ON_ERROR_STOP=1 -q -f "$KOK/scripts/docentlik-entegrasyon/storage-yetkileri.sql"
(cd "$KOK" && TMPDIR="$D" PR7_PG_URL="$PGU" node scripts/docentlik-entegrasyon/sema-kur.mjs)
for v in "pr7rest 53001 1000" "pr7rest300 53002 300"; do set -- $v
  docker run -d --name $1 --network pr7ag -p $2:3000 -e PGRST_DB_URI="postgres://authenticator:pr7-yerel@pr7db:5432/postgres" \
   -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$SIR -e PGRST_DB_MAX_ROWS=$3 postgrest/postgrest:v12.2.3 >/dev/null
done
pkill -f "docentlik-entegrasyon/gecit.mjs" 2>/dev/null || true
(cd "$KOK" && (node scripts/docentlik-entegrasyon/gecit.mjs > "$D/gecit.log" 2>&1 &) && (PR7_GECIT_PORT=54401 PR7_REST=300 node scripts/docentlik-entegrasyon/gecit.mjs > "$D/gecit300.log" 2>&1 &))
sleep 3
(cd "$KOK" && TMPDIR="$D" PR7_SERVICE_KEY="$(cat "$D/service.key")" node --import ./tests/register.mjs scripts/docentlik-entegrasyon/tohum.mjs)
cat > "$D/next.env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54400
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(cat "$D/anon.key")
SUPABASE_SERVICE_ROLE_KEY=$(cat "$D/service.key")
NEXT_PUBLIC_SITE_URL=http://localhost:3100
ENV
echo "PR7 yığını hazır. Anahtarlar: $D/anon.key, $D/service.key; Next ortamı: $D/next.env"
