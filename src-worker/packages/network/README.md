# VRC Packages network contracts

`vrc-packages-network` contains internal leased-ingestion contracts and pure policy shared by the Worker coordinator and crawler nodes.
It is a separate package under Worker ownership, not a Worker source entry point or a consumer application SDK.

The package contains node wire schemas, evidence classes, URL/IP checks, robots snapshots, bot identity, SemVer checks and title/link hygiene.
It contains no D1 storage, node SQLite storage, credentials, DNS resolver, source adapter or scheduler.
The robots reader accepts an injected safe transport and an explicit runtime user-agent. It does not choose an egress implementation.
It uses the public operator credential schema from `vrc-packages-api` without adding node jobs to that SDK.

Consumers use the declared subpath exports in `package.json`.
Exports point to compiled JavaScript and TypeScript declarations in `dist`.
They do not expose TypeScript source, sibling paths or a forwarding barrel.
Each runtime supplies its own product version to `crawlerUserAgent`.
HTTP identity uses `VRCPDiscoveryBot/{version}`. Robots checks also retain restrictions for the earlier bot token.
Both checks must allow the target. Earlier refusals do not disappear through wildcard fallback after the rename.

## Delivery status

This package publishes as a single-stream GitHub Release tarball. It has no npm registry publication.
Version `0.0.0` in a bootstrap manifest does not identify a published archive.
Install checked GitHub Release tarballs into each consumer. Do not link sibling source folders.

Root delivery scripts publish one rapid `YYYY.M.Patch` stream without `-pre` labels.
Both consumer channels declare the same GitHub archive URL. Each consumer supplies its selected SDK as a peer dependency.
The peer bounds match the release and preview SDK configurations. The development dependency uses the preview SDK alias.
Distribution checks test one packed tarball against both SDK channels through Node, Bun, TypeScript, and native Worker runtimes.
Root preparation downloads checked published dependencies instead of building sibling source.
It checks the remote tag, CI source, receipt, release notes, and checksums before installation.
The package stays `private: true` because GitHub tarball distribution does not need npm publication.
The SDK `v0.1.0` owner-review hold stays active. Neither package installation nor artifact publication authorizes live source access.

Use [the publishing guide](../../../docs/source/PUBLISHING.md) to prepare development artifacts and independent consumers.
From the repository root, run `bun run prepare:dev preview worker` after metadata sync and network archive publication.
Inside this package directory, run `bun run typecheck`, `bun run build`, `bun run test`, and `bun run test:distribution` to verify changes.
Check the artifact files, exports, license, declarations, and runtime behavior before release.
