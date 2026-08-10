# npm audit triage — amr-dashboard

**Date:** 2026-08-10
**Requirement:** [`spec.md`](spec.md) REQ-10 (reproducible dependency tree + triaged audit)
**Lockfile:** `amr-dashboard/package-lock.json` (committed)

## How this was produced

```bash
cd amr-dashboard
npm install          # regenerated the lockfile after REQ-11 dead-dep removal
npm audit            # initial: 10 vulnerabilities (3 moderate, 6 high, 1 critical)
npm audit fix        # non-breaking fixes only → 7 remain
npm audit            # final state recorded below
```

`npm audit fix` (non-breaking) cleared **3** findings — **nanoid**, **postcss**, and
**socket.io-parser** — by bumping patch/minor versions inside the existing major ranges.
`npm test` (9 tests) and `npm run build` were re-run afterward and both pass, so the
non-breaking bumps introduced no regressions.

The remaining **7** are only fixable with `npm audit fix --force`, which performs
**breaking** major bumps (Vite 5→7, Vitest 2→3) and a **downgrade** of `ros3d`
(1.1.0 → 0.17.0). We deliberately do **not** apply `--force`; each remaining item is
triaged below.

## Remaining findings (7) and disposition

| Package | Severity | Shipped to browser? | Disposition |
|---|---|---|---|
| `vitest` | Critical | **No** (test-only) | **Accept.** The advisory (GHSA — arbitrary file read/exec) applies only when the **Vitest UI server** (`vitest --ui`) is listening. This project runs headless `vitest run` and never starts the UI server. Not in `dist/`. Revisit at the next Vitest major bump. |
| `vite` | High | **No** (dev/build-only) | **Accept.** Dev-server path-traversal / `server.fs.deny` bypass / `launch-editor` NTLM disclosure — all affect the **dev server**, which is only ever run on the local operator workstation. The shipped artifact is the static `dist/` build, which contains none of this. |
| `vite-node` | Moderate | **No** (test-only) | **Accept.** Pulled in by Vitest; same scope as `vite`/`vitest`. |
| `@vitest/mocker` | Moderate | **No** (test-only) | **Accept.** Vitest transitive; test-runner only. |
| `esbuild` | Moderate | **No** (dev-only) | **Accept.** "Any website can send requests to the esbuild dev server and read the response" — dev-server-only, not present in the production build. |
| `three` | High | **Yes** (bundled inside `ros3d`) | **Accept, bounded by trust model.** We removed the *direct* `three` dependency (REQ-11); the only remaining copy is the old `three` **bundled by `ros3d`** (`node_modules/ros3d/node_modules/three`). The advisory is a DoS in `three`'s model-loader parsing untrusted mesh input. In this app, meshes are fetched from the operator's own `VITE_MESH_SERVER_URL` on the trusted robot LAN — the same trust boundary documented for rosbridge in [`../../amr-dashboard/README.md`](../../amr-dashboard/README.md#security-model) (REQ-05). Upgrading requires `ros3d` to publish a build on modern `three`; track upstream. |
| `ros3d` | High | **Yes** | **Accept.** Flagged **only** because it "depends on a vulnerable version of `three`" — it has no independent advisory. Same disposition as `three` above. `npm audit fix --force` would *downgrade* it to 0.17.0 (an older, also-vulnerable line) and break the URDF widget API, so it is not applied. |

## Summary

- **Reproducible tree:** lockfile committed; `npm ci` reproduces exactly.
- **Shipped-runtime exposure:** limited to `three`/`ros3d`, both bounded by the
  documented trusted-network trust model (REQ-05) and used only by the URDF widget.
- **Everything else** is dev/test/build tooling not present in `dist/`, accepted until
  the next breaking-change maintenance window (Vite 7 / Vitest 3).
- **Re-triage trigger:** revisit when `ros3d` ships against modern `three`, or at the
  next planned Vite/Vitest major upgrade.
