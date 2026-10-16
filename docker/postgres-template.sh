#!/bin/sh
set -eu

template=/opt/replaykit-template
schema=/opt/replaykit/schema.sql

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ "$(id -u)" = 70 ] && [ "$(id -g)" = 70 ] || fail POSTGRES_TEMPLATE_INVALID_USER
[ -d "$template" ] && [ ! -L "$template" ] || fail POSTGRES_TEMPLATE_INVALID_DIRECTORY
[ -f "$schema" ] && [ ! -L "$schema" ] || fail POSTGRES_TEMPLATE_INVALID_SCHEMA
contents=$(ls -A "$template") || fail POSTGRES_TEMPLATE_DIRECTORY_UNREADABLE
[ -z "$contents" ] || fail POSTGRES_TEMPLATE_DIRECTORY_NOT_EMPTY
chmod 700 "$template"

# No password is supplied or embedded in the image. TCP authentication cannot succeed
# until each disposable runtime clone installs its own secret.
initdb -D "$template" --username=replaykit --auth-local=trust --auth-host=scram-sha-256
printf '\nhost all all all scram-sha-256\n' >> "$template/pg_hba.conf"

running=0
finish() {
  if [ "$running" = 1 ]; then
    pg_ctl -D "$template" -m fast -w stop >/dev/null 2>&1 || true
  fi
}
trap finish EXIT HUP INT TERM
pg_ctl -D "$template" -o "-c listen_addresses='' -c unix_socket_directories=/tmp -c fsync=on" -w start
running=1
createdb -h /tmp -U replaykit replaykit
psql -X --no-password -h /tmp -U replaykit -d replaykit -v ON_ERROR_STOP=1 -f "$schema"
empty=$(psql -X --no-password -h /tmp -U replaykit -d replaykit -tA -v ON_ERROR_STOP=1 \
  -c 'SELECT (SELECT count(*) FROM charges) + (SELECT count(*) FROM payment_attempts);')
[ "$empty" = 0 ] || fail POSTGRES_TEMPLATE_CONTAINS_APPLICATION_DATA
credential=$(psql -X --no-password -h /tmp -U replaykit -d replaykit -tA -v ON_ERROR_STOP=1 \
  -c "SELECT rolpassword IS NULL FROM pg_authid WHERE rolname = 'replaykit';")
[ "$credential" = t ] || fail POSTGRES_TEMPLATE_CONTAINS_CREDENTIAL
pg_ctl -D "$template" -m fast -w stop
running=0
trap - EXIT HUP INT TERM
[ ! -e "$template/postmaster.pid" ] || fail POSTGRES_TEMPLATE_NOT_STOPPED
LC_ALL=C pg_controldata -D "$template" | grep -Eq '^Database cluster state:[[:space:]]+shut down$' \
  || fail POSTGRES_TEMPLATE_NOT_CLEAN
printf '%s\n' empty-schema-no-password > "$template/.replaykit-template-verified"
