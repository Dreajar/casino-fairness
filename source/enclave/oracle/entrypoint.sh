#!/bin/sh
# This entrypoint runs only inside the production enclave image. Node owns the
# Unix socket; socat exposes the unchanged JSON protocol on AF_VSOCK port 5000.
# We keep the script alive as PID 1 (via `wait`) so the enclave does not exit if
# a child momentarily restarts, and we log each step to the enclave console
# (visible under `nitro-cli console` in --debug-mode) for observability.
cd /opt/replicate-games || { echo "[entry] cannot cd to workdir"; exit 1; }
: "${ORACLE_SOCKET:=/tmp/replicate-games-oracle.sock}"

# Reverse RPC carries only attestation documents and KMS ciphertext. CID 3 is
# the parent; the fresh RSA recipient private key never leaves this enclave.
socat UNIX-LISTEN:/tmp/casino-recovery.sock,fork,mode=0600 VSOCK-CONNECT:3:6001 &
recovery_pid=$!

echo "[entry] starting fairness oracle (node)"
node enclave/oracle/service.mjs &
oracle_pid=$!
echo "[entry] node pid=$oracle_pid"

i=0
while [ ! -S "$ORACLE_SOCKET" ]; do
  if ! kill -0 "$oracle_pid" 2>/dev/null; then
    echo "[entry] node exited before creating the socket"
    wait "$oracle_pid"
    exit $?
  fi
  i=$((i + 1))
  if [ "$i" -gt 600 ]; then
    echo "[entry] timed out waiting for $ORACLE_SOCKET"
    exit 1
  fi
  sleep 0.1
done
echo "[entry] oracle socket is ready: $ORACLE_SOCKET"

echo "[entry] starting socat AF_VSOCK bridge on port 5000"
socat VSOCK-LISTEN:5000,fork,reuseaddr "UNIX-CONNECT:$ORACLE_SOCKET" &
socat_pid=$!
echo "[entry] socat pid=$socat_pid"

# Stay alive as long as either child is running; if one dies, report and exit so
# the enclave terminates deterministically instead of hanging.
while kill -0 "$oracle_pid" 2>/dev/null && kill -0 "$socat_pid" 2>/dev/null && kill -0 "$recovery_pid" 2>/dev/null; do
  sleep 1
done
echo "[entry] a child process exited (node=$oracle_pid socat=$socat_pid); shutting down"
exit 1
