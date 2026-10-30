#!/usr/bin/python3
import json
import os
import pathlib
import re
import shutil
import stat
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

MAX_FILES = 100_000
MAX_COMPRESSED = 250 * 1024 * 1024
MAX_EXTRACTED = 1024 * 1024 * 1024
MAX_FILE = 64 * 1024 * 1024
WORKSPACE = pathlib.Path("/workspace/repositories")
UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
SHA = re.compile(r"^[0-9a-f]{40}$")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Repository download unexpectedly redirected")

def progress(phase, repository_id, index, total):
    print(json.dumps({"phase": phase, "repositoryId": repository_id, "index": index, "total": total}), flush=True)

def validate_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname != "codeload.github.com" or parsed.username or parsed.password or parsed.port:
        raise RuntimeError("Repository download URL is not allowed")

def safe_relative(name):
    normalized = name.replace("\\", "/")
    path = pathlib.PurePosixPath(normalized)
    if path.is_absolute() or not path.parts or any(part in ("", ".", "..") for part in path.parts):
        raise RuntimeError("Archive contains an unsafe path")
    stripped = path.parts[1:]
    return pathlib.PurePosixPath(*stripped) if stripped else None

def download(url, destination, budget):
    validate_url(url)
    opener = urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(url, headers={"User-Agent": "legwork-sandbox"})
    with opener.open(request, timeout=60) as response, open(destination, "xb") as output:
        if response.status != 200:
            raise RuntimeError("Repository download failed")
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            budget["compressed"] += len(chunk)
            if budget["compressed"] > MAX_COMPRESSED:
                raise RuntimeError("Archive compressed size limit exceeded")
            output.write(chunk)

def staged_archive_paths(repository_id):
    # /tmp for the Docker provider; sbx gives /tmp only a small tmpfs, so it stages under /workspace.
    name = f"ocai-archive-{repository_id}.tar.gz"
    return (f"/tmp/{name}", f"/workspace/.staged/{name}")

def account_staged(archive, budget):
    # Providers without sandbox egress stream the archive in before bootstrap runs.
    info = archive.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError("Staged archive is not a regular file")
    budget["compressed"] += info.st_size
    if budget["compressed"] > MAX_COMPRESSED:
        raise RuntimeError("Archive compressed size limit exceeded")

def extract(archive, destination, budget):
    destination.mkdir(parents=True, mode=0o700)
    root = destination.resolve()
    with tarfile.open(archive, mode="r:gz") as source:
        for member in source:
            relative = safe_relative(member.name)
            if relative is None:
                continue
            if member.isdir():
                target = destination.joinpath(*relative.parts)
                target.mkdir(parents=True, exist_ok=True, mode=0o700)
                if not target.resolve().is_relative_to(root):
                    raise RuntimeError("Archive path escaped repository root")
                continue
            if not member.isfile():
                raise RuntimeError("Archive links and special entries are not allowed")
            budget["files"] += 1
            budget["extracted"] += member.size
            if budget["files"] > MAX_FILES:
                raise RuntimeError("Archive file count limit exceeded")
            if member.size > MAX_FILE:
                raise RuntimeError("Archive entry size limit exceeded")
            if budget["extracted"] > MAX_EXTRACTED:
                raise RuntimeError("Archive extracted size limit exceeded")
            target = destination.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if not target.parent.resolve().is_relative_to(root):
                raise RuntimeError("Archive path escaped repository root")
            stream = source.extractfile(member)
            if stream is None:
                raise RuntimeError("Archive entry could not be read")
            written = 0
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor = os.open(target, flags, stat.S_IMODE(member.mode) & 0o755 or 0o600)
            try:
                while True:
                    chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > member.size or written > MAX_FILE:
                        raise RuntimeError("Archive entry size limit exceeded")
                    os.write(descriptor, chunk)
                if written != member.size:
                    raise RuntimeError("Archive entry size did not match its header")
            finally:
                os.close(descriptor)

def chown_tree(path):
    # sbx runs the whole sandbox as one unprivileged user with no network, so there is
    # no separate analyst account to hand the tree to.
    if os.geteuid() != 0:
        return
    os.chown(path, 10001, 10001)
    for root, directories, files in os.walk(path):
        for name in directories + files:
            os.chown(os.path.join(root, name), 10001, 10001, follow_symlinks=False)

def main():
    if len(sys.argv) != 2 or sys.argv[1] != "/workspace/bootstrap-manifest.json":
        raise RuntimeError("Invalid bootstrap manifest path")
    manifest_path = pathlib.Path(sys.argv[1])
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    repositories = manifest.get("repositories")
    if not isinstance(repositories, list) or not 1 <= len(repositories) <= 3:
        raise RuntimeError("Manifest must contain between one and three repositories")
    budget = {"files": 0, "compressed": 0, "extracted": 0}
    WORKSPACE.mkdir(parents=True, exist_ok=True, mode=0o711)
    # The analyst user must traverse into its repositories; it cannot list their siblings.
    os.chmod(WORKSPACE, 0o711)
    for index, repository in enumerate(repositories, start=1):
        if not isinstance(repository, dict):
            raise RuntimeError("Invalid repository manifest entry")
        repository_id = repository.get("repositoryId")
        sha = repository.get("sha")
        url = repository.get("downloadUrl")
        staged = repository.get("archivePath")
        if not isinstance(repository_id, str) or not UUID.fullmatch(repository_id):
            raise RuntimeError("Invalid repository identifier")
        if not isinstance(sha, str) or not SHA.fullmatch(sha):
            raise RuntimeError("Invalid repository revision")
        if staged is None and not isinstance(url, str):
            raise RuntimeError("Invalid repository download URL")
        if staged is not None and (url is not None or staged not in staged_archive_paths(repository_id)):
            raise RuntimeError("Invalid staged repository archive")
        destination = WORKSPACE / repository_id
        if destination.exists():
            raise RuntimeError("Repository destination already exists")
        if staged is None:
            archive_path = pathlib.Path(tempfile.mkstemp(prefix="ocai-archive-", suffix=".tar.gz", dir="/tmp")[1])
            archive_path.unlink()
        else:
            archive_path = pathlib.Path(staged)
        try:
            if staged is None:
                progress("downloading", repository_id, index, len(repositories))
                download(url, archive_path, budget)
            else:
                account_staged(archive_path, budget)
            progress("extracting", repository_id, index, len(repositories))
            extract(archive_path, destination, budget)
            chown_tree(destination)
        except Exception:
            shutil.rmtree(destination, ignore_errors=True)
            raise
        finally:
            archive_path.unlink(missing_ok=True)

try:
    main()
finally:
    pathlib.Path("/workspace/bootstrap-manifest.json").unlink(missing_ok=True)
