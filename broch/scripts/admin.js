#!/usr/bin/env node
'use strict';
// Offline account tools for the person who runs the server (there is no "forgot password" mail: nobody else can reset a password).
//
//   node scripts/admin.js list-users               [DATA_DIR]
//   node scripts/admin.js reset-password EMAIL     [DATA_DIR]   asks for the new password (or reads it from the BROCH_NEW_PASSWORD environment variable)
//   node scripts/admin.js make-admin EMAIL         [DATA_DIR]
//   node scripts/admin.js delete-user EMAIL        [DATA_DIR]   removes the account and its logins (only possible when the person is in no open or running game)
//
// STOP THE APP FIRST. The server keeps the accounts in memory and writes them back on every change, so an edit made while it runs is lost (or overwrites newer sign-ups).
// DATA_DIR defaults to $DATA_DIR, then ../data. On TrueNAS run it inside the app container shell or with the Node of the same dataset, as the same user (568), e.g.
//   docker run --rm -it --user 568:568 -v /mnt/POOL/broch/app:/app:ro -v /mnt/POOL/broch/data:/data -e DATA_DIR=/data node:22-alpine node /app/scripts/admin.js reset-password friend@example.com
// (the zip from make-dist contains this script). The password hash format is the same as in server/index.js: scrypt, 16 random salt bytes (hex), 64 byte key (hex).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const [cmd, a1, a2] = process.argv.slice(2);
const arg = cmd === 'list-users' ? undefined : a1, dirArg = cmd === 'list-users' ? a1 : a2;
const DATA_DIR = path.resolve(dirArg || process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const usersFile = path.join(DATA_DIR, 'users.json');
const sessionsFile = path.join(DATA_DIR, 'sessions.json');
const MIN_PASSWORD = 8, MAX_PASSWORD = 256;

function die(msg) { console.error('Error: ' + msg); process.exit(1); }
function load(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; return die(`${file} cannot be read (${e.message}). Nothing was changed.`); }
}
function save(file, data) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.copyFileSync(file, file + '.bak'); } catch { /* first save */ }
  fs.renameSync(tmp, file);
}
function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, a => { rl.close(); resolve(a); }); // (typed text is visible; for a one-off reset use BROCH_NEW_PASSWORD instead)
  });
}
function findUser(users, email) {
  const e = String(email || '').trim().toLowerCase();
  const u = users.find(x => x.email === e);
  if (!u) die(`no account with the email "${e}". Run "list-users" to see them.`);
  return u;
}
function dropSessions(userId) {
  const sessions = load(sessionsFile, {});
  let n = 0;
  for (const [k, v] of Object.entries(sessions)) if (v && v.userId === userId) { delete sessions[k]; n++; }
  if (n) save(sessionsFile, sessions);
  return n;
}

(async () => {
  if (!fs.existsSync(usersFile)) die(`${usersFile} does not exist. Is DATA_DIR right? (given: ${DATA_DIR})`);
  const users = load(usersFile, []);
  if (!Array.isArray(users)) die(`${usersFile} is not a list of accounts. Nothing was changed.`);
  if (cmd === 'list-users') {
    for (const u of users) console.log(`${u.email}\t${u.name}${u.admin ? '\t(admin)' : ''}`);
    console.log(`${users.length} account(s) in ${DATA_DIR}`);
  } else if (cmd === 'reset-password') {
    const u = findUser(users, arg);
    const pw = process.env.BROCH_NEW_PASSWORD || await ask(`New password for ${u.name} <${u.email}> (at least ${MIN_PASSWORD} characters): `);
    if (pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD) die(`the password needs ${MIN_PASSWORD} to ${MAX_PASSWORD} characters. Nothing was changed.`);
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = crypto.scryptSync(pw, u.salt, 64).toString('hex');
    save(usersFile, users);
    const n = dropSessions(u.id);
    console.log(`Password of ${u.name} <${u.email}> changed; ${n} login(s) on other devices ended. Start the app again.`);
  } else if (cmd === 'make-admin') {
    const u = findUser(users, arg);
    u.admin = true;
    save(usersFile, users);
    console.log(`${u.name} <${u.email}> is an admin now. Start the app again.`);
  } else if (cmd === 'delete-user') {
    const u = findUser(users, arg);
    if (u.admin && users.filter(x => x.admin).length === 1) die('this is the only admin. Make another account admin first (make-admin).');
    const gamesDir = path.join(DATA_DIR, 'games');
    const active = fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir).filter(f => f.endsWith('.json')).map(f => load(path.join(gamesDir, f), null))
      .filter(g => g && g.meta && Array.isArray(g.meta.seats) && g.meta.seats.includes(u.id) && g.meta.status !== 'over' && g.meta.status !== 'abandoned') : [];
    if (active.length) die(`${u.name} still sits in ${active.length} open or running game(s) (${active.map(g => g.meta.name || g.meta.id).join(', ')}). Let the host abandon them first. Nothing was changed.`);
    users.splice(users.indexOf(u), 1);
    save(usersFile, users);
    const n = dropSessions(u.id);
    console.log(`Account ${u.name} <${u.email}> deleted (${n} login(s) ended). Start the app again.`);
  } else {
    console.log('Usage: node scripts/admin.js list-users|reset-password EMAIL|make-admin EMAIL|delete-user EMAIL [DATA_DIR]\nStop the app before you run it.');
    process.exit(cmd ? 1 : 0);
  }
})();
