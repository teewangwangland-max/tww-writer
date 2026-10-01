/**
 * Auth.gs — password hashing, sessions, login/logout/me/changePassword,
 * and the requireUser_/requireAdmin_ guards used by the router.
 */

/** Error constructor used everywhere; router turns it into {ok:false,error,message}. */
function ApiError(code, message) {
  this.code = code;
  this.message = message;
  this.name = 'ApiError';
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

function bytesToHex_(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    if (h.length < 2) h = '0' + h;
    hex += h;
  }
  return hex;
}

function hashPassword_(password, saltHex) {
  var h = saltHex + ':' + password;
  for (var i = 0; i < HASH_ITERATIONS; i++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8);
    h = bytesToHex_(bytes);
  }
  return h;
}

function newSalt_() {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Date.now(),
    Utilities.Charset.UTF_8
  );
  return bytesToHex_(bytes).slice(0, 32);
}

function sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytesToHex_(bytes);
}

/** Constant-time-ish string compare. */
function safeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isActive_(v) {
  return v === true || v === 'TRUE' || v === 'true';
}

/** Public, safe-to-return shape of a Users row. Never includes hash/salt. */
function publicUser_(u) {
  return {
    user_id: u.user_id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    playfulness_default: Number(u.playfulness_default),
    catchphrases: u.catchphrases,
    avoid_list: u.avoid_list
  };
}

function authLogin_(body) {
  var username = String((body && body.username) || '').trim().toLowerCase();
  var password = String((body && body.password) || '');
  var cache = CacheService.getScriptCache();
  var failKey = 'fail:' + username;
  var failCount = parseInt(cache.get(failKey) || '0', 10);
  if (failCount >= LOGIN_MAX_FAILS) {
    throw new ApiError('LOCKED');
  }

  var user = findBy_('Users', 'username', username);
  var passOk = false;
  if (user && isActive_(user.active)) {
    var hash = hashPassword_(password, user.pass_salt);
    passOk = safeEqual_(hash, user.pass_hash);
  }

  if (!user || !isActive_(user.active) || !passOk) {
    cache.put(failKey, String(failCount + 1), LOGIN_LOCK_SECONDS);
    throw new ApiError('BAD_CREDENTIALS');
  }

  cache.remove(failKey);
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var now = new Date();
  var expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 3600 * 1000);
  withLock_(function () {
    append_('Sessions', {
      token_hash: sha256Hex_(token),
      user_id: user.user_id,
      created_at: nowIso_(),
      expires_at: expiresAt.toISOString(),
      last_seen_at: nowIso_()
    });
  });

  return { token: token, user: publicUser_(user) };
}

/** Looks up the session by hashed token; throws UNAUTHORIZED if missing/expired. Returns the full Users row. */
function requireUser_(body) {
  var token = body && body.token;
  if (!token) throw new ApiError('UNAUTHORIZED');
  var tokenHash = sha256Hex_(String(token));
  var session = findBy_('Sessions', 'token_hash', tokenHash);
  if (!session) throw new ApiError('UNAUTHORIZED');

  var now = new Date();
  var expiresAt = new Date(session.expires_at);
  if (!(expiresAt.getTime() > now.getTime())) throw new ApiError('UNAUTHORIZED');

  var user = findBy_('Users', 'user_id', session.user_id);
  if (!user) throw new ApiError('UNAUTHORIZED');

  var lastSeen = session.last_seen_at ? new Date(session.last_seen_at) : null;
  if (!lastSeen || now.getTime() - lastSeen.getTime() >= 3600000) {
    withLock_(function () {
      updateRow_('Sessions', session._row, { last_seen_at: nowIso_() });
    });
  }

  return user;
}

function requireAdmin_(body) {
  var user = requireUser_(body);
  if (user.role !== 'admin') throw new ApiError('FORBIDDEN');
  return user;
}

function authMe_(body, user) {
  return { user: publicUser_(user) };
}

function authLogout_(body, user) {
  var tokenHash = sha256Hex_(String(body.token));
  var session = findBy_('Sessions', 'token_hash', tokenHash);
  if (session) {
    withLock_(function () {
      updateRow_('Sessions', session._row, { expires_at: nowIso_() });
    });
  }
  return { ok: true };
}

function authChangePassword_(body, user) {
  var oldPassword = String(body.oldPassword || '');
  var newPassword = String(body.newPassword || '');
  var hash = hashPassword_(oldPassword, user.pass_salt);
  if (!safeEqual_(hash, user.pass_hash)) throw new ApiError('BAD_CREDENTIALS');
  if (newPassword.length < 8) throw new ApiError('WEAK_PASSWORD');

  var salt = newSalt_();
  var newHash = hashPassword_(newPassword, salt);
  withLock_(function () {
    updateRow_('Users', user._row, { pass_salt: salt, pass_hash: newHash });
  });
  return { ok: true };
}
