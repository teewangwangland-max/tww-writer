/**
 * StyleDna.gs — versioned, append-only Style DNA. scope = HOUSE or a user_id.
 */

function styleDnaCheckRead_(scope, user) {
  if (user.role === 'admin') return;
  if (scope === HOUSE_SCOPE) return;
  if (scope === user.user_id) return;
  throw new ApiError('FORBIDDEN');
}

function styleDnaCheckWrite_(scope, user) {
  if (scope === HOUSE_SCOPE) {
    if (user.role !== 'admin') throw new ApiError('FORBIDDEN');
    return;
  }
  if (scope === user.user_id) return;
  throw new ApiError('FORBIDDEN');
}

function styleDnaAllVersions_(scope) {
  var rows = readAll_('StyleDNA');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].scope === scope) out.push(rows[i]);
  }
  out.sort(function (a, b) {
    return Number(b.version) - Number(a.version);
  });
  return out;
}

function styleDnaToClient_(r) {
  return {
    scope: r.scope,
    version: Number(r.version),
    dna: parseJson_(r.dna_json, null),
    changelog: r.changelog,
    source_example_ids: parseJson_(r.source_example_ids, []),
    created_by: r.created_by,
    created_at: r.created_at
  };
}

function stylednaGet_(body, user) {
  var scope = body.scope;
  if (!scope) throw new ApiError('BAD_INPUT', 'scope required');
  styleDnaCheckRead_(scope, user);
  var versions = styleDnaAllVersions_(scope);
  if (versions.length === 0) return null;
  return styleDnaToClient_(versions[0]);
}

function stylednaHistory_(body, user) {
  var scope = body.scope;
  if (!scope) throw new ApiError('BAD_INPUT', 'scope required');
  styleDnaCheckRead_(scope, user);
  var versions = styleDnaAllVersions_(scope);
  var out = [];
  for (var i = 0; i < versions.length; i++) out.push(styleDnaToClient_(versions[i]));
  return out;
}

function stylednaSave_(body, user) {
  var scope = body.scope;
  if (!scope) throw new ApiError('BAD_INPUT', 'scope required');
  styleDnaCheckWrite_(scope, user);

  var changelog = String(body.changelog || '');
  if (!changelog || changelog.length > 5000) throw new ApiError('BAD_INPUT', 'changelog invalid');

  var dnaJson = typeof body.dna === 'string' ? body.dna : JSON.stringify(body.dna);
  if (dnaJson.length > 50000) throw new ApiError('BAD_INPUT', 'dna too large');

  var result;
  withLock_(function () {
    var versions = styleDnaAllVersions_(scope);
    var version = versions.length > 0 ? Number(versions[0].version) + 1 : 1;
    var row = {
      dna_id: newId_('dna'),
      scope: scope,
      version: version,
      dna_json: dnaJson,
      changelog: changelog,
      source_example_ids: JSON.stringify(body.source_example_ids || []),
      created_by: user.user_id,
      created_at: nowIso_(),
      is_current: ''
    };
    append_('StyleDNA', row);
    result = styleDnaToClient_(row);
  });
  return result;
}

function stylednaRollback_(body, user) {
  var scope = body.scope;
  if (!scope) throw new ApiError('BAD_INPUT', 'scope required');
  styleDnaCheckWrite_(scope, user);

  var toVersion = Number(body.to_version);
  if (!toVersion) throw new ApiError('BAD_INPUT', 'to_version required');

  var result;
  withLock_(function () {
    var versions = styleDnaAllVersions_(scope);
    var target = null;
    for (var i = 0; i < versions.length; i++) {
      if (Number(versions[i].version) === toVersion) target = versions[i];
    }
    if (!target) throw new ApiError('NOT_FOUND');

    var version = versions.length > 0 ? Number(versions[0].version) + 1 : 1;
    var row = {
      dna_id: newId_('dna'),
      scope: scope,
      version: version,
      dna_json: target.dna_json,
      changelog: 'ย้อนกลับไปใช้ v' + toVersion,
      source_example_ids: target.source_example_ids,
      created_by: user.user_id,
      created_at: nowIso_(),
      is_current: ''
    };
    append_('StyleDNA', row);
    result = styleDnaToClient_(row);
  });
  return result;
}
