# prod-v1 adds the NSM helper and the two socat bridges, so its PCR0 is
# intentionally different from design-v1. Pin both build and runtime images.
FROM rust:1.88.0-bookworm@sha256:4727898c104ecd2e22d780925832502faee9fe4e70581b8572af081370b315a0 AS nsm

ARG SOURCE_DATE_EPOCH=0
ENV SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH
# Build a fully static musl binary so the helper carries no ELF interpreter or
# shared-library dependency and runs unchanged inside the slim runtime image /
# enclave. A glibc-dynamic binary fails to exec there (missing loader).
RUN printf '%s\n' \
      'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20260120T000000Z bookworm main' \
      > /etc/apt/sources.list \
    && rm -f /etc/apt/sources.list.d/debian.sources \
    && rustup target add x86_64-unknown-linux-musl \
    && apt-get -o Acquire::Check-Valid-Until=false update \
    && apt-get install -y --no-install-recommends musl-tools=1.2.3-1 \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt/* \
    && rm -f /var/log/dpkg.log /var/cache/ldconfig/aux-cache
WORKDIR /build/nsm-attest
COPY enclave/nsm-attest/Cargo.toml enclave/nsm-attest/Cargo.lock ./
COPY enclave/nsm-attest/src ./src
RUN cargo build --release --locked --target x86_64-unknown-linux-musl \
    && cp target/x86_64-unknown-linux-musl/release/nsm-attest /nsm-attest

# Docker Official Image node:24.14.1-bookworm-slim (Node 24 LTS), resolved
# 2026-08-25. The digest pins the multi-architecture manifest; builds always
# specify linux/amd64.
FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS oracle-runtime

ARG SOURCE_DATE_EPOCH=0
ARG DICE_PROOF_RELEASE_ID
ENV NODE_ENV=production \
    TZ=UTC \
    ORACLE_SOCKET=/tmp/replicate-games-oracle.sock \
    DICE_PROOF_RELEASE_ID=$DICE_PROOF_RELEASE_ID \
    SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH
WORKDIR /opt/replicate-games

COPY --from=nsm /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
# apt and dpkg logs contain the wall-clock install time as file content;
# rewrite-timestamp can normalize metadata, but not those bytes.
RUN test -n "$DICE_PROOF_RELEASE_ID" \
    && printf '%s\n' \
      'deb [check-valid-until=no] https://snapshot.debian.org/archive/debian/20260120T000000Z bookworm main' \
      > /etc/apt/sources.list \
    && rm -f /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Check-Valid-Until=false update \
    && apt-get install -y --no-install-recommends socat=1.7.4.4-2 openssl=3.0.18-1~deb12u1 \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt/* \
    && rm -f /var/log/dpkg.log /var/cache/ldconfig/aux-cache

COPY package.json provably-fair.js ./
COPY enclave/oracle ./enclave/oracle
COPY enclave/vsock-proxy ./enclave/vsock-proxy
COPY packages/dice-proof ./packages/dice-proof
COPY --from=nsm /nsm-attest /usr/local/bin/nsm-attest
RUN sed -i 's/\r$//' enclave/oracle/entrypoint.sh \
    && chmod 0755 enclave/oracle/entrypoint.sh

# Run as root INSIDE the enclave on purpose: the nsm-attest helper must open
# the root-owned /dev/nsm device to obtain a genuine attestation. The enclave
# itself is the isolation boundary (no shell, no network, no operator access),
# so there is no privilege to de-escalate to. Do not add `USER node` here — it
# makes /dev/nsm unreadable and the attestor fails closed.
CMD ["/opt/replicate-games/enclave/oracle/entrypoint.sh"]

# Explicit opt-in build target for the generalized measured game service.
# Build enclave/dist with build-game-service.mjs first; retain game-build.json
# beside the EIF so reviewers can reproduce its exact policy and source inputs.
FROM oracle-runtime AS game-runtime
COPY enclave/dist/game-service.mjs ./enclave/oracle/service.mjs
COPY enclave/dist/game-build.json ./enclave/game-build.json

# Preserve the existing Dice demonstration image for its existing build command.
FROM oracle-runtime AS dice-runtime
