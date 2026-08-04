/* 真题考试通 - 聚合云函数 examApi
 * 所有账号/审核/学习数据操作都走这里，前端不直接访问数据库。
 * action: initAdmin | register | login | getMe | adminList | approve | delUser
 *         | getStudy | saveStudy | getStats
 */
const cloud = require("@cloudbase/node-sdk");
const crypto = require("crypto");

const app = cloud.init({ env: "kaoji-d2g92wlv34453fe55" });
const db = app.database();
const users = db.collection("users");
const study = db.collection("study");

// 服务端密钥（建议部署后用环境变量覆盖）
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret-change-me-2026";
const ADMIN_INIT_SECRET = process.env.ADMIN_INIT_SECRET || "seed-admin-2026";

/* ---------- 密码哈希 (scrypt，真实安全哈希) ---------- */
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}
function verifyPw(pw, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const check = crypto.scryptSync(pw, parts[1], 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(parts[2], "hex"));
  } catch {
    return false;
  }
}

/* ---------- 会话 token (HMAC 签名) ---------- */
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig !== expect) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

/* ---------- 业务 ---------- */
async function initAdmin(event) {
  if (event.secret !== ADMIN_INIT_SECRET) return { code: -1, message: "forbidden" };
  const name = "admin";
  const r = await users.doc(name).get();
  if (r.data && r.data.length) {
    await users.doc(name).update({ role: "admin", status: "approved" });
    return { code: 0, message: "admin 已存在，已校正为管理员" };
  }
  await users.doc(name).set({
    pw: hashPw("admin888"),
    role: "admin",
    status: "approved",
    createdAt: Date.now(),
    approvedAt: Date.now(),
  });
  return { code: 0, message: "admin 初始化成功(admin/admin888)" };
}

async function register(event) {
  const name = String(event.name || "").trim();
  const pw = String(event.pw || "");
  if (!/^[\w一-龥]{2,20}$/.test(name)) return { code: -1, message: "用户名2-20位(字母/数字/中文)" };
  if (pw.length < 6) return { code: -1, message: "密码至少6位" };
  const r = await users.doc(name).get();
  if (r.data && r.data.length) return { code: -1, message: "该用户名已存在" };
  await users.doc(name).set({
    pw: hashPw(pw),
    role: "user",
    status: "pending",
    createdAt: Date.now(),
  });
  return { code: 0, message: "注册成功，等待管理员审核", pending: true };
}

async function login(event) {
  const name = String(event.name || "").trim();
  const pw = String(event.pw || "");
  const r = await users.doc(name).get();
  const u = r.data && r.data[0];
  if (!u || !verifyPw(pw, u.pw)) return { code: -1, message: "用户名或密码错误" };
  if (u.status === "pending") return { code: -1, message: "账号正在等待管理员审核，通过后可登录" };
  if (u.status === "rejected") return { code: -1, message: "账号未通过审核，请联系管理员" };
  const token = signToken({
    username: name,
    role: u.role,
    status: u.status,
    exp: Date.now() + 7 * 86400000,
  });
  return { code: 0, message: "登录成功", data: { token, name, role: u.role, status: u.status } };
}

async function getMe(event) {
  const p = verifyToken(event.token);
  if (!p) return { code: -1, message: "未登录或登录已过期" };
  const r = await users.doc(p.username).get();
  const u = r.data && r.data[0];
  if (!u) return { code: -1, message: "账号不存在" };
  return { code: 0, data: { name: u._id, role: u.role, status: u.status } };
}

async function adminList(event) {
  const p = verifyToken(event.token);
  if (!p || p.role !== "admin") return { code: -1, message: "无权访问" };
  const r = await users.limit(200).get();
  const list = (r.data || []).map((u) => ({
    name: u._id,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt || null,
    approvedAt: u.approvedAt || null,
  }));
  return { code: 0, data: list };
}

async function approve(event) {
  const p = verifyToken(event.token);
  if (!p || p.role !== "admin") return { code: -1, message: "无权访问" };
  const name = String(event.name || "").trim();
  const status = event.status; // 'approved' | 'rejected'
  if (!["approved", "rejected"].includes(status)) return { code: -1, message: "非法状态" };
  if (name === "admin") return { code: -1, message: "不能操作管理员账号" };
  const r = await users.doc(name).get();
  if (!r.data || !r.data.length) return { code: -1, message: "用户不存在" };
  const upd = { status };
  if (status === "approved") upd.approvedAt = Date.now();
  await users.doc(name).update(upd);
  return { code: 0, message: "操作成功" };
}

async function delUser(event) {
  const p = verifyToken(event.token);
  if (!p || p.role !== "admin") return { code: -1, message: "无权访问" };
  const name = String(event.name || "").trim();
  if (name === "admin") return { code: -1, message: "不能删除管理员账号" };
  const r = await users.doc(name).get();
  if (!r.data || !r.data.length) return { code: -1, message: "用户不存在" };
  await users.doc(name).remove();
  return { code: 0, message: "删除成功" };
}

/* ---------- 学习数据(云端同步, 按用户名隔离) ---------- */
function defaultStudy() { return { progress: {}, wrong: [], fav: [], records: [] }; }

async function getStudy(event) {
  const p = verifyToken(event.token);
  if (!p) return { code: -1, message: "未登录或登录已过期" };
  const r = await study.doc(p.username).get();
  const d = (r.data && r.data[0]) || {};
  return { code: 0, data: {
    progress: d.progress || {},
    wrong: d.wrong || [],
    fav: d.fav || [],
    records: d.records || [],
  }};
}

async function saveStudy(event) {
  const p = verifyToken(event.token);
  if (!p) return { code: -1, message: "未登录或登录已过期" };
  const patch = event.patch || {};
  const r = await study.doc(p.username).get();
  const existing = (r.data && r.data[0]) || {};
  // 仅用白名单字段构造文档，绝不带入 _id / _openid
  const out = {
    progress: ("progress" in patch ? patch.progress : existing.progress) || {},
    wrong:    ("wrong"    in patch ? patch.wrong    : existing.wrong)    || [],
    fav:      ("fav"      in patch ? patch.fav      : existing.fav)      || [],
    records:  ("records"  in patch ? patch.records  : existing.records) || [],
    updatedAt: Date.now(),
  };
  await study.doc(p.username).set(out);
  return { code: 0, message: "已保存" };
}

// 管理员统计：跨用户聚合考试次数（学习记录已全云端化）
async function getStats(event) {
  const p = verifyToken(event.token);
  if (!p || p.role !== "admin") return { code: -1, message: "无权访问" };
  const r = await study.limit(1000).get();
  let exams = 0;
  (r.data || []).forEach(d => { exams += (d.records || []).length; });
  return { code: 0, data: { exams } };
}

exports.main = async (event) => {
  try {
    const action = event && event.action;
    switch (action) {
      case "initAdmin": return await initAdmin(event);
      case "register": return await register(event);
      case "login": return await login(event);
      case "getMe": return await getMe(event);
      case "adminList": return await adminList(event);
      case "approve": return await approve(event);
      case "delUser": return await delUser(event);
      case "getStudy": return await getStudy(event);
      case "saveStudy": return await saveStudy(event);
      case "getStats": return await getStats(event);
      default: return { code: -1, message: "未知操作: " + action };
    }
  } catch (e) {
    return { code: -1, message: e.message || "server error" };
  }
};
