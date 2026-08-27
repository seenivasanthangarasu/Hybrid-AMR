# C.Prompt — Client-Side Connection Setup

Run this on the machine that will run the operator dashboard
(`amr-dashboard/` in this repo), with the output of [S.Prompt](S.Prompt.md)
— the fenced ` ```connection ` block and active-topics table — pasted at
the bottom of this prompt. Its job is to point this dashboard at that
robot and confirm the link actually comes up, not just assume it will.

Do not guess any IP or port S.Prompt did not provide, and do not fall
back to `localhost` defaults if the block says a service is down.

## What to do

1. **Parse** the `connection` block for `primary_ip`, `rosbridge_port`,
   `web_video_port`, `mesh_server_url`.
   - If `rosbridge_port` is `NOT RUNNING`: stop here and report that back.
     There's nothing to connect to yet — don't write a config pointing at
     a dead port and call it done.

2. **Verify reachability before touching any config:**
   - Ping `primary_ip`.
   - TCP-check `rosbridge_port` (and `web_video_port`, if given).
   - If `primary_ip` is unreachable but an `alternate_ip` is listed, try
     that instead and note the switch when you report back.

3. **Write `amr-dashboard/.env`** (copy from `.env.example` if it doesn't
   exist yet):
   ```
   VITE_ROSBRIDGE_URL=ws://<primary_ip>:<rosbridge_port>
   VITE_WEB_VIDEO_URL=http://<primary_ip>:<web_video_port>
   VITE_MESH_SERVER_URL=<mesh_server_url>
   ```
   Omit (or leave commented) `VITE_WEB_VIDEO_URL` / `VITE_MESH_SERVER_URL`
   if S.Prompt reported those as not running / `none`.

4. **Start the dev server.** Vite doesn't hot-reload env changes, so if
   one is already running against a different `.env`, restart it — don't
   rely on the old process picking up the new values.

5. **Verify in the browser, don't just trust the process came up clean:**
   - Header shows `ROSBRIDGE LINKED` (not `OFFLINE` / retrying).
   - Cross-check panels against S.Prompt's active-topics table: a topic
     listed there as active but showing `NO SIGNAL` in the dashboard is a
     real discrepancy (stale snapshot, wrong NIC, firewall) — flag it by
     name, don't wave it away as "probably fine."

6. **Report back:** final `.env` values, link status, and any
   discrepancies from step 5 (or say explicitly there were none).

## Input from S.Prompt

<paste the ```connection``` block and active-topics table here>
