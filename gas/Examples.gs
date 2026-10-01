/**
 * Examples.gs — examples.list/add/importDoc, plus admin whole-folder import.
 */

function examplesList_(body, user) {
  var rows = readAll_('Examples');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!isActive_(r.active)) continue;
    if (body.format_id && r.format_id !== body.format_id) continue;
    if (body.owner && r.owner !== body.owner) continue;
    out.push(stripRow_(r));
  }
  out.sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return out.slice(0, 100);
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

  var row;
  withLock_(function () {
    row = {
      example_id: newId_('ex'),
      owner: owner,
      format_id: body.format_id,
      title: body.title,
      body: body.body,
      source: 'manual',
      source_ref: '',
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
function importDocById_(docId, formatId, owner, createdBy) {
  var existing = null;
  var examples = readAll_('Examples');
  for (var i = 0; i < examples.length; i++) {
    if (examples[i].source_ref === docId && isActive_(examples[i].active)) {
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
  var remaining = false;

  while (files.hasNext()) {
    if ((Date.now() - startTime) / 1000 >= 270) {
      remaining = true;
      break;
    }
    var file = files.next();
    var result;
    withLock_(function () {
      result = importDocById_(file.getId(), formatId, ownerUserId, user.user_id);
    });
    if (result.duplicate) skipped++;
    else imported++;
  }

  return { imported: imported, skipped: skipped, remaining: remaining };
}
