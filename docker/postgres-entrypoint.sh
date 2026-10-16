#!/bin/sh
set -eu

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ "$(id -u)" = 70 ] && [ "$(id -g)" = 70 ] || fail POSTGRES_BOOTSTRAP_INVALID_USER
[ "$#" = 0 ] || fail POSTGRES_BOOTSTRAP_UNEXPECTED_ARGUMENTS
[ "${PGDATA:-}" = /var/lib/postgresql/data ] || fail POSTGRES_BOOTSTRAP_INVALID_PGDATA
[ -d "$PGDATA" ] && [ ! -L "$PGDATA" ] || fail POSTGRES_BOOTSTRAP_INVALID_PGDATA
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-}
[ "${#POSTGRES_PASSWORD}" = 64 ] || fail POSTGRES_BOOTSTRAP_INVALID_PASSWORD
case "$POSTGRES_PASSWORD" in
  *[!0-9a-f]*) fail POSTGRES_BOOTSTRAP_INVALID_PASSWORD ;;
esac
fsync=${REPLAYKIT_PG_FSYNC:-on}
case "$fsync" in
  on|off) ;;
  *) fail POSTGRES_BOOTSTRAP_INVALID_FSYNC ;;
esac

contents=$(ls -A "$PGDATA") || fail POSTGRES_BOOTSTRAP_PGDATA_UNREADABLE
[ -z "$contents" ] || fail POSTGRES_BOOTSTRAP_PGDATA_NOT_EMPTY
template=/opt/replaykit-template
[ -f "$template/.replaykit-template-verified" ] || fail POSTGRES_BOOTSTRAP_TEMPLATE_UNVERIFIED
[ "$(cat "$template/.replaykit-template-verified")" = empty-schema-no-password ] \
  || fail POSTGRES_BOOTSTRAP_TEMPLATE_UNVERIFIED
[ ! -e "$template/postmaster.pid" ] || fail POSTGRES_BOOTSTRAP_TEMPLATE_NOT_STOPPED
cp -R "$template/." "$PGDATA/" || fail POSTGRES_BOOTSTRAP_COPY_FAILED
chmod 700 "$PGDATA"

# The validated hex value cannot escape its SQL literal. Neither the password SQL
# nor PostgreSQL's single-user diagnostics may reach logs, including on failure.
if ! printf "ALTER ROLE replaykit PASSWORD '%s';\n" "$POSTGRES_PASSWORD" \
  | postgres --single -D "$PGDATA" -c log_statement=none -c log_min_error_statement=panic \
    -c fsync="$fsync" replaykit >/dev/null 2>&1; then
  fail POSTGRES_BOOTSTRAP_CREDENTIAL_FAILED
fi
unset POSTGRES_PASSWORD
exec postgres -D "$PGDATA" -c listen_addresses='*' -c fsync="$fsync"
