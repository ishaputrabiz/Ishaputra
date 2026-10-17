# Server and logic tests

Plain Node scripts. They bundle the real source with esbuild, swap `firebase-admin`
for an in-memory fake (`fake-firebase-admin.mjs`) and mock Meta with a fake `fetch`.
Nothing reaches Firestore, Meta or R2.

Run from the project root:

```
node scripts/tests/announcement.test.mjs .     # broadcast + announcement + STOP opt-out
node scripts/tests/whatsapp-reply.test.mjs .   # send-media, picture templates, big media
node scripts/tests/whatsapp-templates.test.mjs . # code vs submitted Meta templates (name, variables, button)
```

Or run both with Node's runner: `node --test "scripts/tests/*.test.mjs"` (quote the glob; Node 22 does not accept the folder).

Build output goes to `scripts/tests/out/` (git-ignored).
