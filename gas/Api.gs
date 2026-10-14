/**
 * Api.gs — JSON API router.
 * Frontend calls this web app with POST, Content-Type: text/plain, body = JSON string
 * (to avoid CORS preflight). Every response is JSON {ok:true,data} or
 * {ok:false,error:CODE,message?}.
 */

var ROUTES = {
  ping: { auth: 'none', fn: function (body) { return { pong: true, version: APP_VERSION }; } },

  'auth.login': { auth: 'none', fn: authLogin_ },
  'auth.me': { auth: 'user', fn: authMe_ },
  'auth.logout': { auth: 'user', fn: authLogout_ },
  'auth.changePassword': { auth: 'user', fn: authChangePassword_ },

  'users.list': { auth: 'user', fn: usersList_ },
  'users.updateProfile': { auth: 'user', fn: usersUpdateProfile_ },

  'posts.list': { auth: 'user', fn: postsList_ },
  'posts.get': { auth: 'user', fn: postsGet_ },
  'posts.save': { auth: 'user', fn: postsSave_ },

  'formats.list': { auth: 'user', fn: formatsList_ },
  'formats.get': { auth: 'user', fn: formatsGet_ },
  'formats.save': { auth: 'admin', fn: formatsSave_ },

  'examples.list': { auth: 'user', fn: examplesList_ },
  'examples.add': { auth: 'user', fn: examplesAdd_ },
  'examples.update': { auth: 'user', fn: examplesUpdate_ },
  'examples.importDoc': { auth: 'user', fn: examplesImportDoc_ },
  'examples.importFolder': { auth: 'admin', fn: examplesImportFolder_ },

  'styledna.get': { auth: 'user', fn: stylednaGet_ },
  'styledna.history': { auth: 'user', fn: stylednaHistory_ },
  'styledna.save': { auth: 'user', fn: stylednaSave_ },
  'styledna.rollback': { auth: 'user', fn: stylednaRollback_ },

  'comps.list': { auth: 'user', fn: compsList_ },
  'comps.add': { auth: 'user', fn: compsAdd_ }
};

function doGet(e) {
  return jsonOut_({ ok: true, app: APP_NAME, version: APP_VERSION });
}

function doPost(e) {
  var contents = e && e.postData && e.postData.contents;

  if (typeof contents === 'string' && contents.length > MAX_BODY_BYTES) {
    return jsonOut_({ ok: false, error: 'TOO_LARGE' });
  }

  var body;
  try {
    body = JSON.parse(contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'BAD_JSON' });
  }

  var action = body && body.action;
  var route = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null;
  if (!route) {
    return jsonOut_({ ok: false, error: 'UNKNOWN_ACTION' });
  }

  try {
    var user = null;
    if (route.auth === 'user') {
      user = requireUser_(body);
    } else if (route.auth === 'admin') {
      user = requireAdmin_(body);
    }
    var data = route.fn(body, user);
    return jsonOut_({ ok: true, data: data });
  } catch (err) {
    if (err instanceof ApiError) {
      return jsonOut_({ ok: false, error: err.code, message: err.message });
    }
    console.error(err);
    return jsonOut_({ ok: false, error: 'SERVER_ERROR', message: String((err && err.message) || err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
