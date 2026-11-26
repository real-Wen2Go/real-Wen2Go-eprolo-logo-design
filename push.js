#!/usr/bin/env node
/* ============================================================
   push.js —— 用 GitHub REST API 推送整棵树
   ------------------------------------------------------------
   为什么不用 git push：
     本机 github.com / ssh.github.com 均不可达（网络层拦截），
     但 api.github.com 正常。git push 只走 github.com，所以必然失败。
     这里改用 Git Data API（blobs → tree → commit → ref），
     全程只访问 api.github.com。

   用法：
     node push.js --token ghp_xxxx
     GITHUB_TOKEN=ghp_xxxx node push.js
     node push.js --token ghp_xxxx --repo eprolo-logo-design --private
     node push.js --check            # 只做连通性与权限自检，不写任何东西

   需要的 token 权限：
     经典 token  → 勾选 repo（整块）
     细粒度 token → Administration: Read and write（建库）
                    + Contents: Read and write（写文件）
   ============================================================ */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API = 'https://api.github.com';
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
const hasFlag = k => args.includes('--' + k);

const TOKEN = (getArg('token', '') || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
const REPO = getArg('repo', 'real-Wen2Go-eprolo-logo-design');
const PRIVATE = hasFlag('private');
const CHECK_ONLY = hasFlag('check');
const DESC = getArg('desc', 'EPROLO 品牌标志、动效源码与导出管线');

if (!TOKEN) {
  console.error(`
未提供 token。

  node push.js --token ghp_xxxxxxxx

获取方式（30 秒）：
  1. 打开 https://github.com/settings/tokens/new
  2. Note 随便填（如 eprolo-upload），Expiration 选 7 days
  3. 权限只勾 repo 这一整块
  4. Generate token，复制 ghp_ 开头那串

token 只在本次进程内存里用，不落盘。
`);
  process.exit(1);
}

const H = {
  'Authorization': 'Bearer ' + TOKEN,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'eprolo-push-script'
};

async function apiOnce(method, url, body, timeout) {
  const opt = { method, headers: { ...H }, signal: AbortSignal.timeout(timeout) };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(url.startsWith('http') ? url : API + url, opt);
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { }
  if (!r.ok) {
    const msg = json && json.message ? json.message : text.slice(0, 300);
    const err = new Error(`${method} ${url} -> ${r.status} ${msg}`);
    err.status = r.status;
    err.body = json;
    throw err;
  }
  return json;
}

/* 空仓库刚有第一个提交时，GitHub 后端有几百毫秒到几秒的同步延迟，
   紧接着的 POST /git/blobs 会返回 409 "Git Repository is empty"。
   对 409 与 5xx 做指数退避重试。 */
async function api(method, url, body, timeout = 60000, retries = 5) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      return await apiOnce(method, url, body, timeout);
    } catch (e) {
      last = e;
      const retriable = !e.status || e.status === 409 || e.status >= 500;
      if (!retriable || i === retries) throw e;
      const wait = Math.min(8000, 600 * Math.pow(2, i));
      process.stderr.write(`  [重试 ${i + 1}] ${e.status || 'net'} 等待 ${wait}ms\n`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw last;
}

(async () => {
  // ---------- 1. 身份 ----------
  const me = await api('GET', '/user');
  const OWNER = me.login;
  console.log(`账号：${OWNER}`);

  // 权限自检：能读出 scopes 说明是经典 token
  const scopes = await fetch(API + '/user', { headers: H, signal: AbortSignal.timeout(20000) })
    .then(r => r.headers.get('x-oauth-scopes'))
    .catch(() => null);
  if (scopes !== null) console.log(`token scopes：${scopes || '（空，细粒度 token 不返回此项）'}`);

  if (CHECK_ONLY) {
    const exists = await api('GET', `/repos/${OWNER}/${REPO}`).then(() => true).catch(e => e.status === 404 ? false : Promise.reject(e));
    console.log(`仓库 ${OWNER}/${REPO}：${exists ? '已存在' : '不存在（将新建）'}`);
    console.log('自检通过。去掉 --check 即可推送。');
    return;
  }

  // ---------- 2. 仓库 ----------
  let repo = await api('GET', `/repos/${OWNER}/${REPO}`).catch(e => {
    if (e.status === 404) return null;
    if (e.status === 403) throw new Error('token 没有读权限。经典 token 请勾选 repo 整块。');
    throw e;
  });

  if (!repo) {
    console.log(`新建仓库 ${OWNER}/${REPO} …`);
    repo = await api('POST', '/user/repos', {
      name: REPO,
      description: DESC,
      private: PRIVATE,
      auto_init: false,          // 不要 README，否则会多一个无关的初始提交
      has_issues: true,
      has_wiki: false
    });
    console.log(`  已建：${repo.html_url}`);
  } else {
    console.log(`仓库已存在：${repo.html_url}（默认分支 ${repo.default_branch}）`);
  }

  // ---------- 3. 取分支并确保仓库已初始化 ----------
  // GitHub 的 Git Data API 在完全空的仓库上用不了（POST /git/blobs 直接 409
  // "Git Repository is empty"）。所以空库要先走一次 Contents API 建个文件，
  // 让它有初始 ref，之后 blob / tree / commit 才可用。
  const branch = repo.default_branch || 'main';
  let parentSha = null;
  const ref = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${branch}`)
    .catch(e => (e.status === 404 || e.status === 409) ? null : Promise.reject(e));

  if (ref && ref.object) {
    parentSha = ref.object.sha;
    console.log(`接在已有提交 ${parentSha.slice(0, 7)} 之后`);
  } else {
    console.log('空仓库，先用 Contents API 建初始 ref …');
    const initPath = 'README.md';
    const initBuf = fs.readFileSync(path.join(__dirname, initPath));
    const j = await api('PUT', `/repos/${OWNER}/${REPO}/contents/${initPath}`, {
      message: '初始化仓库',
      content: initBuf.toString('base64'),
      branch
    });
    parentSha = j.commit.sha;
    console.log(`  初始提交 ${parentSha.slice(0, 7)}`);
  }

  // ---------- 4. 收集文件 ----------
  const files = execSync('git ls-files -z', { cwd: __dirname, maxBuffer: 1 << 26 })
    .toString().split('\0').filter(Boolean);

  console.log(`待推送 ${files.length} 个文件`);

  // ---------- 5. 上传 blob ----------
  const tree = [];
  let done = 0, totalBytes = 0;
  const CONC = 4;

  async function one(p) {
    const buf = fs.readFileSync(path.join(__dirname, p));
    if (buf.length > 95 * 1024 * 1024) {
      console.warn(`  跳过（超过 95MB）：${p}`);
      return;
    }
    const b = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64'
    }, 180000);
    tree.push({ path: p, mode: '100644', type: 'blob', sha: b.sha });
    totalBytes += buf.length;
    done++;
    if (done % 10 === 0 || done === files.length) {
      process.stdout.write(`\r  blob ${done}/${files.length}  ${(totalBytes / 1048576).toFixed(1)}MB   `);
    }
  }

  const queue = files.slice();
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (queue.length) await one(queue.shift());
  }));
  process.stdout.write('\n');

  // ---------- 6. 建树 ----------
  const t = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree }, 60000);
  console.log(`tree ${t.sha.slice(0, 10)}（${tree.length} 项）`);

  // 父提交若是我们刚建的占位提交（只有 README、无 parent），就不接在它后面，
  // 改为强推孤立提交，让远端历史保持干净的一条。
  let parents = parentSha ? [parentSha] : [];
  if (parentSha) {
    const cm = await api('GET', `/repos/${OWNER}/${REPO}/git/commits/${parentSha}`).catch(() => null);
    if (cm && cm.message === '初始化仓库' && (!cm.parents || cm.parents.length === 0)) {
      parents = [];
      console.log('父提交是占位初始化提交，改推孤立提交，历史不保留它');
    }
  }

  // 本地 HEAD 的提交信息，保持两边一致
  let message = 'EPROLO 品牌与动效库';
  try {
    message = execSync('git log -1 --pretty=%B', { cwd: __dirname }).toString().trim() || message;
  } catch (e) { }

  const c = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message, tree: t.sha, parents
  }, 60000);
  console.log(`commit ${c.sha.slice(0, 7)}`);

  // ---------- 7. 移动分支 ----------
  // 用 ref 是否存在判断，而不是 parents：占位提交场景下 parents 为空但 ref 已存在。
  if (ref && ref.object) {
    await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`, { sha: c.sha, force: true });
  } else {
    await api('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: c.sha });
  }
  console.log(`分支 ${branch} → ${c.sha.slice(0, 7)}`);

  // ---------- 8. 收尾 ----------
  await api('PATCH', `/repos/${OWNER}/${REPO}`, { default_branch: branch }).catch(() => { });

  const final = await api('GET', `/repos/${OWNER}/${REPO}`);
  console.log(`\n完成：${final.html_url}`);
  console.log(`  ${final.size} KB · ${final.visibility} · 默认分支 ${final.default_branch}`);

  // 让本地 remote 指对（下次还能用 git，但要等 github.com 可达）
  try {
    execSync(`git remote set-url origin ${final.clone_url}`, { cwd: __dirname, stdio: 'ignore' });
  } catch (e) { }
})().catch(e => {
  console.error('\n失败：' + e.message);
  if (e.status === 401) console.error('  token 无效或已过期。');
  if (e.status === 403) console.error('  token 权限不足：经典 token 需要勾选 repo 整块；细粒度需要 Administration + Contents 写权限。');
  if (e.status === 404) console.error('  资源不存在，或 token 对该仓库无访问权。');
  process.exit(1);
});
