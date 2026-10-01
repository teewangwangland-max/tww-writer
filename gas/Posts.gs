/**
 * Posts.gs — posts.list/get/save (incl. optional Google Doc creation and
 * saving a post as a style example).
 */

var POSTS_LIST_HIDDEN_FIELDS = ['inputs_json', 'results_json', 'narrative_json', 'tone_json', 'body'];

function usersDisplayNameMap_() {
  var rows = readAll_('Users');
  var map = {};
  for (var i = 0; i < rows.length; i++) map[rows[i].user_id] = rows[i].display_name;
  return map;
}

function postsList_(body, user) {
  var scope = body.scope || 'all';
  if (['all', 'mine', 'friends'].indexOf(scope) === -1) throw new ApiError('BAD_INPUT', 'invalid scope');
  var q = body.q ? String(body.q).toLowerCase() : '';

  var rows = readAll_('Posts');
  var nameMap = usersDisplayNameMap_();
  var formatLatest = formatsLatestMap_();

  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (scope === 'mine' && r.user_id !== user.user_id) continue;
    if (scope === 'friends' && r.user_id === user.user_id) continue;
    if (q) {
      var pn = String(r.project_name || '').toLowerCase();
      var loc = String(r.location || '').toLowerCase();
      if (pn.indexOf(q) === -1 && loc.indexOf(q) === -1) continue;
    }

    var clean = stripRow_(r);
    for (var f = 0; f < POSTS_LIST_HIDDEN_FIELDS.length; f++) {
      delete clean[POSTS_LIST_HIDDEN_FIELDS[f]];
    }
    clean.author_name = nameMap[r.user_id] || '';
    var fmt = formatLatest[r.format_id];
    clean.format_name = fmt ? fmt.name : '';
    out.push(clean);
  }

  out.sort(function (a, b) {
    return String(b.updated_at).localeCompare(String(a.updated_at));
  });

  return out.slice(0, 200);
}

function postToClient_(r, nameMap) {
  var clean = stripRow_(r);
  clean.inputs = parseJson_(r.inputs_json, null);
  clean.results = parseJson_(r.results_json, null);
  clean.narrative = parseJson_(r.narrative_json, null);
  clean.tone = parseJson_(r.tone_json, null);
  delete clean.inputs_json;
  delete clean.results_json;
  delete clean.narrative_json;
  delete clean.tone_json;
  clean.author_name = nameMap[r.user_id] || '';
  return clean;
}

function postsGet_(body, user) {
  var postId = body.post_id;
  if (!postId) throw new ApiError('BAD_INPUT', 'post_id required');
  var row = findBy_('Posts', 'post_id', postId);
  if (!row) throw new ApiError('NOT_FOUND');
  var nameMap = usersDisplayNameMap_();
  return postToClient_(row, nameMap);
}

function postsSave_(body, user) {
  var input = body.post || {};
  var formatId = input.format_id;
  var projectName = input.project_name;
  var postStatus = input.post_status || 'draft';
  var bodyText = input.body || '';

  if (!formatId) throw new ApiError('BAD_INPUT', 'format_id required');
  if (!projectName || String(projectName).length > 200) throw new ApiError('BAD_INPUT', 'project_name invalid');
  if (POST_STATUSES.indexOf(postStatus) === -1) throw new ApiError('BAD_INPUT', 'post_status invalid');
  if (String(bodyText).length > 60000) throw new ApiError('BAD_INPUT', 'body too long');

  var result;
  withLock_(function () {
    var existing = input.post_id ? findBy_('Posts', 'post_id', input.post_id) : null;
    var row;
    var now = nowIso_();

    if (!input.post_id) {
      row = {
        post_id: newId_('post'),
        user_id: user.user_id,
        format_id: formatId,
        project_name: projectName,
        location: input.location || '',
        post_status: postStatus,
        case_summary: input.case_summary || '',
        inputs_json: JSON.stringify(input.inputs || {}),
        results_json: JSON.stringify(input.results || {}),
        narrative_json: JSON.stringify(input.narrative || {}),
        tone_json: JSON.stringify(input.tone || {}),
        body: bodyText,
        doc_url: '',
        is_style_example: '',
        created_at: now,
        updated_at: now
      };
      append_('Posts', row);
    } else {
      if (!existing) throw new ApiError('NOT_FOUND');
      if (existing.user_id !== user.user_id) throw new ApiError('FORBIDDEN');
      var patch = {
        format_id: formatId,
        project_name: projectName,
        location: input.location || '',
        post_status: postStatus,
        case_summary: input.case_summary || '',
        inputs_json: JSON.stringify(input.inputs || {}),
        results_json: JSON.stringify(input.results || {}),
        narrative_json: JSON.stringify(input.narrative || {}),
        tone_json: JSON.stringify(input.tone || {}),
        body: bodyText,
        updated_at: now
      };
      updateRow_('Posts', existing._row, patch);
      row = Object.assign({}, existing, patch);
      row._row = existing._row;
    }

    if (body.createDoc) {
      var dateStr = new Date().toISOString().slice(0, 10);
      var title = projectName + ' · ' + user.display_name + ' · ' + dateStr;
      var doc = DocumentApp.create(title);
      doc.getBody().setText(bodyText);
      var docsFolderId = PropertiesService.getScriptProperties().getProperty(PROP_DOCS_FOLDER_ID);
      DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(docsFolderId));
      var docUrl = doc.getUrl();
      updateRow_('Posts', row._row, { doc_url: docUrl });
      row.doc_url = docUrl;
    }

    if (body.saveAsExample) {
      updateRow_('Posts', row._row, { is_style_example: true });
      row.is_style_example = true;

      var existingExample = null;
      var examples = readAll_('Examples');
      for (var i = 0; i < examples.length; i++) {
        if (examples[i].source_ref === row.post_id && isActive_(examples[i].active)) {
          existingExample = examples[i];
          break;
        }
      }
      if (existingExample) {
        updateRow_('Examples', existingExample._row, { title: projectName, body: bodyText });
      } else {
        append_('Examples', {
          example_id: newId_('ex'),
          owner: user.user_id,
          format_id: formatId,
          title: projectName,
          body: bodyText,
          source: 'post',
          source_ref: row.post_id,
          created_by: user.user_id,
          created_at: nowIso_(),
          active: true
        });
      }
    }

    var nameMap = usersDisplayNameMap_();
    result = { post: postToClient_(row, nameMap) };
  });

  return result;
}
