#!/bin/sh
# POSIX shell installer shipped as a GitHub Release asset.
set -eu

install() (
    fail() { echo "ml-intern-mcp: $*" >&2; exit 1; }
    usage='Usage: sh install.sh copilot|codex|vscode|standalone [hf] [exe.dev] [modal] (or public-files)'
    case "${1:-}" in
        --help|-h) echo "$usage"; return ;;
        codex|copilot|vscode|standalone) client=$1; shift ;;
        *) fail "$usage" ;;
    esac
    for provider do
        case "$provider" in
            hf|exe.dev|modal) ;;
            public-files) [ "$#" = 1 ] || fail 'Use public-files by itself.' ;;
            *) fail "$usage" ;;
        esac
    done
    case "$client" in
        vscode) command -v code >/dev/null || fail 'Enable the VS Code shell command (code) and retry.' ;;
        standalone) ;;
        *) command -v "$client" >/dev/null || fail "Install the $client CLI and retry." ;;
    esac

    version=0.3.1
    node_version=22.23.5
    platform=$(uname -s)-$(uname -m)
    case "$platform" in
        Linux-x86_64)
            target=linux-x64
            runtime_hash=c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1
            if ldd --version 2>&1 | grep -qi musl; then
                target=linux-x64-musl
                runtime_hash=83b8ba916eb22e89ba8274426a40f7aa0011c6e4c5ff77a5b03793f781a90786
            fi ;;
        Linux-aarch64)
            target=linux-arm64
            runtime_hash=8bd3dc69eee8f3f226315a80d7d1d4faccf217a4c8fae500168ac2e38f3bdba3 ;;
        Darwin-arm64)
            target=darwin-arm64
            runtime_hash=e7131995759b61a0170b646010d2ad35a5d37b4cb0d471f3e8317eac6f742f3d ;;
        Darwin-x86_64)
            target=darwin-x64
            runtime_hash=c53383238206b9ae4db23c5d8a63645e2e753bec8ab51a49cc81939aa64e9422 ;;
        *) fail "Unsupported platform: $platform" ;;
    esac
    data_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}/ml-intern-mcp
    case "$data_dir" in /*) ;; *) fail 'The installation directory must be absolute.' ;; esac
    dest=$data_dir/v$version-$target
    umask 077
    mkdir -p "$data_dir"
    temp=$(mktemp -d "$data_dir/.install.XXXXXXXX")
    trap 'rm -rf "$temp"' EXIT
    trap 'exit 1' HUP INT TERM
    if [ ! -x "$dest/ml-intern-mcp" ]; then
        base=https://github.com/candacelabs/ml-intern-mcp/releases/download/v$version
        node=node-v$node_version-$target
        fetch() { curl -q --fail --silent --show-error --location --retry 2 --proto '=https' --proto-redir '=https' "$1" -o "$2"; }
        if command -v sha256sum >/dev/null; then
            digest() { sha256sum < "$1" | cut -d ' ' -f 1; }
        else
            command -v shasum >/dev/null || fail 'Install sha256sum or shasum to verify downloads.'
            digest() { shasum -a 256 < "$1" | cut -d ' ' -f 1; }
        fi
        echo "Downloading ML Intern MCP v$version and its $target runtime..." >&2
        fetch "$base/SHA256SUMS" "$temp/sums"
        fetch "$base/ml-intern-mcp.tar.gz" "$temp/app.tar.gz"
        app_hash=$(awk '$2 == "ml-intern-mcp.tar.gz" {print $1}' "$temp/sums")
        [ "$(digest "$temp/app.tar.gz")" = "$app_hash" ] || fail 'Server checksum mismatch.'
        fetch "https://nodejs.org/dist/v$node_version/$node.tar.gz" "$temp/node.tar.gz"
        [ "$(digest "$temp/node.tar.gz")" = "$runtime_hash" ] || fail 'Runtime checksum mismatch.'
        stage=$temp/install
        mkdir -p "$stage/app" "$stage/runtime"
        tar -xzf "$temp/app.tar.gz" -C "$stage/app"
        tar -xzf "$temp/node.tar.gz" -C "$stage/runtime" --strip-components=1 "$node/bin/node" "$node/LICENSE"
        cat > "$stage/ml-intern-mcp" <<'LAUNCHER'
#!/bin/sh
root=$(dirname "$0")
exec "$root/runtime/bin/node" "$root/app/server.mjs" "$@"
LAUNCHER
        chmod 755 "$stage/ml-intern-mcp"
        [ "$("$stage/ml-intern-mcp" --version)" = "$version" ] || fail 'The installed server could not start.'
        # POSIX rename is atomic. A concurrent installer may already have published this release.
        "$stage/runtime/bin/node" -e '
          const fs = require("node:fs");
          const [source, dest] = process.argv.slice(1);
          try { fs.renameSync(source, dest); } catch (error) {
            if (!["ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
            fs.accessSync(dest + "/ml-intern-mcp", fs.constants.X_OK);
          }
        ' "$stage" "$dest"
    fi
    # Client configurations keep the same executable path across upgrades.
    ln -s "$dest" "$temp/current"
    "$dest/runtime/bin/node" -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$temp/current" "$data_dir/current"
    launcher=$data_dir/current/ml-intern-mcp
    if [ "$client" = standalone ]; then
        echo "$launcher"
    else
        "$dest/runtime/bin/node" "$dest/app/lib/register-client.mjs" "$client" "$launcher" "$@"
    fi
)
# Keep the invocation last so an interrupted download cannot execute a partial function.
install "$@"
