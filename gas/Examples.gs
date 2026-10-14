/**
 * Examples.gs — examples.list/add/update/importDoc, plus admin whole-folder import.
 */

function examplesList_(body, user) {
  var rows = readAll_('Examples');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var active = isActive_(r.active);
    if (!active) {
      var canSee = body.include_hidden === true &&
        (user.role === 'admin' || r.owner === user.user_id);
      if (!canSee) continue;
    }
    if (body.format_id && r.format_id !== body.format_id) continue;
    if (body.owner && r.owner !== body.owner) continue;
    var row = stripRow_(r);
    row.active = active;
    out.push(row);
  }
  out.sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return out.slice(0, 100);
}

function examplesUpdate_(body, user) {
  if (!body.example_id) throw new ApiError('BAD_INPUT', 'example_id required');
  var patch = {};
  if (body.title !== undefined) {
    var title = String(body.title);
    if (!title || title.length > 200) throw new ApiError('BAD_INPUT', 'title invalid');
    patch.title = title;
  }
  if (body.format_id !== undefined) {
    if (typeof body.format_id !== 'string' || body.format_id.length > 100) {
      throw new ApiError('BAD_INPUT', 'format_id invalid');
    }
    patch.format_id = body.format_id;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new ApiError('BAD_INPUT', 'active must be boolean');
    patch.active = body.active;
  }

  var result;
  withLock_(function () {
    var ex = findBy_('Examples', 'example_id', body.example_id);
    if (!ex) throw new ApiError('NOT_FOUND');
    if (user.role !== 'admin' && ex.owner !== user.user_id) throw new ApiError('FORBIDDEN');
    updateRow_('Examples', ex._row, patch);
    var updated = findBy_('Examples', 'example_id', body.example_id);
    result = stripRow_(updated);
    result.active = isActive_(updated.active);
  });
  return result;
}

function examplesAdd_(body, user) {
  var owner = body.owner || user.user_id;
  if (owner === HOUSE_SCOPE) {
    if (user.role !== 'admin') throw new ApiError('FORBIDDEN');
  } else if (owner !== user.user_id) {
    throw new ApiError('FORBIDDEN');
  }

  if (!body.format_id) throw new ApiError('BAD_INPUT', 'format_id required');
  if (!body.title) throw new ApiError('BAD_INPUT', 'title required');
  if (!body.body) throw new ApiError('BAD_INPUT', 'body required');

  var source = body.source === undefined ? 'manual' : String(body.source).slice(0, 50);
  var sourceRef = body.source_ref === undefined ? '' : String(body.source_ref).slice(0, 200);

  var row;
  withLock_(function () {
    row = {
      example_id: newId_('ex'),
      owner: owner,
      format_id: body.format_id,
      title: body.title,
      body: body.body,
      source: source,
      source_ref: sourceRef,
      created_by: user.user_id,
      created_at: nowIso_(),
      active: true
    };
    append_('Examples', row);
  });
  return stripRow_(row);
}

/** Extracts a Google Doc id from a full URL or a bare id string. */
function extractDocId_(input) {
  var s = String(input || '');
  var m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

/** Shared import logic used by examples.importDoc and the folder importer. */
function importDocById_(docId, formatId, owner, createdBy, knownRows) {
  // Any existing row for this doc counts as a duplicate — including hidden ones, so a re-run
  // never brings back an example someone chose to hide.
  var existing = null;
  var examples = knownRows || readAll_('Examples');
  for (var i = 0; i < examples.length; i++) {
    if (String(examples[i].source_ref) === String(docId) && examples[i].source === 'doc') {
      existing = examples[i];
      break;
    }
  }
  if (existing) {
    return { example: stripRow_(existing), duplicate: true };
  }

  var doc;
  try {
    doc = DocumentApp.openById(docId);
  } catch (e) {
    throw new ApiError('DOC_NOT_ACCESSIBLE');
  }

  var text = doc.getBody().getText();
  var title = doc.getName();
  var row = {
    example_id: newId_('ex'),
    owner: owner,
    format_id: formatId,
    title: title,
    body: text,
    source: 'doc',
    source_ref: docId,
    created_by: createdBy,
    created_at: nowIso_(),
    active: true
  };
  append_('Examples', row);
  return { example: stripRow_(row), duplicate: false };
}

function examplesImportDoc_(body, user) {
  var docId = extractDocId_(body.doc);
  if (!docId) throw new ApiError('BAD_INPUT', 'doc invalid');
  if (!body.format_id) throw new ApiError('BAD_INPUT', 'format_id required');
  var owner = body.owner || user.user_id;
  if (owner === HOUSE_SCOPE) {
    if (user.role !== 'admin') throw new ApiError('FORBIDDEN');
  } else if (owner !== user.user_id) {
    throw new ApiError('FORBIDDEN');
  }

  var result;
  withLock_(function () {
    result = importDocById_(docId, body.format_id, owner, user.user_id);
  });
  return result;
}

function examplesImportFolder_(body, user) {
  var folderId = body.folder_id;
  var formatId = body.format_id;
  var ownerUserId = body.owner_user_id;
  if (!folderId || !formatId || !ownerUserId) {
    throw new ApiError('BAD_INPUT', 'folder_id, format_id, owner_user_id required');
  }

  var startTime = Date.now();
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFilesByType(MimeType.GOOGLE_DOCS);

  var imported = 0;
  var skipped = 0;
  var failed = [];
  var remaining = false;
  var knownRows = readAll_('Examples');

  while (files.hasNext()) {
    if ((Date.now() - startTime) / 1000 >= 270) {
      remaining = true;
      break;
    }
    var file = files.next();
    var result = null;
    try {
      withLock_(function () {
        result = importDocById_(file.getId(), formatId, ownerUserId, user.user_id, knownRows);
      });
    } catch (e) {
      failed.push(file.getName());
      continue;
    }
    if (result.duplicate) {
      skipped++;
    } else {
      imported++;
      knownRows.push({ source_ref: file.getId(), source: 'doc' });
    }
  }

  return { imported: imported, skipped: skipped, failed: failed, remaining: remaining };
}
