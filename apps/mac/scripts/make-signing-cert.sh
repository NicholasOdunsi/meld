#!/bin/bash
# Creates the free, home-made code-signing certificate "Orion Self-Signed".
# No Apple account. Run once; the .p12 goes into GitHub secrets, never git.
set -euo pipefail
OUT="${1:-$(git rev-parse --show-toplevel)/.context/orion-mac-signing}"
mkdir -p "$OUT"
cd "$OUT"
NAME="Orion Self-Signed"
PASSWORD="$(openssl rand -hex 24)"
cat > cert.cnf <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
openssl req -x509 -newkey rsa:3072 -nodes -keyout key.pem -out cert.pem -days 3650 -config cert.cnf
openssl pkcs12 -export -legacy -inkey key.pem -in cert.pem -name "$NAME" -out orion-signing.p12 -passout "pass:$PASSWORD"
printf '%s' "$PASSWORD" > p12-password.txt
openssl x509 -in cert.pem -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' > cert-sha256.txt
security import orion-signing.p12 -k "$HOME/Library/Keychains/login.keychain-db" -P "$PASSWORD" -T /usr/bin/codesign
rm -f key.pem cert.cnf
echo "Created $NAME. Fingerprint: $(cat cert-sha256.txt)"
