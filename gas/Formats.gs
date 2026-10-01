/**
 * Formats.gs — versioned, append-only format specs.
 * A "row" is one version; the latest version of a format_id is the row with
 * the highest `version` number.
 */

/** Internal: map format_id -> latest version row (any status), no auth filtering. */
function formatsLatestMap_() {
  var rows = readAll_('Formats');
  var latest = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var cur = latest[r.format_id];
    if (!cur || Number(r.version) > Number(cur.version)) {
      latest[r.format_id] = r;
    }
  }
  return latest;
}

function formatsList_(body, user) {
  var latest = formatsLatestMap_();
  var isAdmin = user.role === 'admin';
  var out = [];
  for (var id in latest) {
    var r = latest[id];
    if (!isAdmin && r.status !== 'published') continue;
    out.push({
      format_id: r.format_id,
      name: r.name,
      version: Number(r.version),
      status: r.status,
      updated_at: r.updated_at
    });
  }
  return out;
}

function formatsGet_(body, user) {
  var formatId = body.format_id;
  if (!formatId) throw new ApiError('BAD_INPUT', 'format_id required');
  var isAdmin = user.role === 'admin';
  var rows = readAll_('Formats');
  var matching = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].format_id === formatId) matching.push(rows[i]);
  }
  if (matching.length === 0) throw new ApiError('NOT_FOUND');

  var latest = matching[0];
  for (var j = 1; j < matching.length; j++) {
    if (Number(matching[j].version) > Number(latest.version)) latest = matching[j];
  }

  if (!isAdmin && latest.status !== 'published') throw new ApiError('NOT_FOUND');

  var target = latest;
  if (body.version !== undefined && body.version !== null) {
    var wanted = Number(body.version);
    var found = null;
    for (var k = 0; k < matching.length; k++) {
      if (Number(matching[k].version) === wanted) found = matching[k];
    }
    if (!found) throw new ApiError('NOT_FOUND');
    target = found;
  }

  return {
    format_id: target.format_id,
    name: target.name,
    version: Number(target.version),
    status: target.status,
    spec: parseJson_(target.spec_json, null)
  };
}

function formatsSave_(body, user) {
  var spec = body.spec;
  var status = body.status;
  if (!spec || typeof spec !== 'object') throw new ApiError('BAD_INPUT', 'spec required');
  if (typeof spec.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) {
    throw new ApiError('BAD_INPUT', 'spec.id invalid');
  }
  if (typeof spec.name !== 'string' || !spec.name) {
    throw new ApiError('BAD_INPUT', 'spec.name required');
  }
  if (FORMAT_STATUSES.indexOf(status) === -1) throw new ApiError('BAD_INPUT', 'status invalid');

  var specJson = JSON.stringify(spec);
  if (specJson.length > 100000) throw new ApiError('BAD_INPUT', 'spec too large');

  var result;
  withLock_(function () {
    var latest = formatsLatestMap_()[spec.id];
    var version = latest ? Number(latest.version) + 1 : 1;
    var row = {
      format_id: spec.id,
      name: spec.name,
      version: version,
      status: status,
      spec_json: specJson,
      created_by: user.user_id,
      created_at: nowIso_(),
      updated_at: nowIso_()
    };
    append_('Formats', row);
    result = { format_id: row.format_id, name: row.name, version: row.version, status: row.status };
  });
  return result;
}
