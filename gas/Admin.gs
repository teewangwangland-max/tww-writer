/**
 * Admin.gs — editor-only functions (run manually from the Apps Script editor).
 * These are NOT exposed through the router / doPost.
 */

function adminCreateUser() {
  var props = PropertiesService.getScriptProperties();
  try {
    var username = String(props.getProperty('NEW_USER_USERNAME') || '').trim().toLowerCase();
    var password = String(props.getProperty('NEW_USER_PASSWORD') || '');
    var display = String(props.getProperty('NEW_USER_DISPLAY') || '');
    var role = props.getProperty('NEW_USER_ROLE') || 'writer';
    if (role !== 'admin' && role !== 'writer') role = 'writer';

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      throw new Error('Invalid username: ' + username);
    }
    if (password.length < 8) {
      throw new Error('Password too short');
    }
    if (findBy_('Users', 'username', username)) {
      throw new Error('Username already taken: ' + username);
    }

    var salt = newSalt_();
    var hash = hashPassword_(password, salt);
    var row = {
      user_id: newId_('user'),
      username: username,
      display_name: display || username,
      role: role,
      pass_hash: hash,
      pass_salt: salt,
      playfulness_default: 3,
      catchphrases: '',
      avoid_list: '',
      active: true,
      created_at: nowIso_()
    };
    withLock_(function () {
      append_('Users', row);
    });
    Logger.log('adminCreateUser: created ' + row.user_id);
    return row.user_id;
  } finally {
    props.deleteProperty('NEW_USER_USERNAME');
    props.deleteProperty('NEW_USER_PASSWORD');
    props.deleteProperty('NEW_USER_DISPLAY');
    props.deleteProperty('NEW_USER_ROLE');
  }
}

function adminResetPassword() {
  var props = PropertiesService.getScriptProperties();
  try {
    var username = String(props.getProperty('RESET_USERNAME') || '').trim().toLowerCase();
    var password = String(props.getProperty('RESET_PASSWORD') || '');
    if (password.length < 8) {
      throw new Error('Password too short');
    }
    var user = findBy_('Users', 'username', username);
    if (!user) {
      throw new Error('No such user: ' + username);
    }
    var salt = newSalt_();
    var hash = hashPassword_(password, salt);
    withLock_(function () {
      updateRow_('Users', user._row, { pass_salt: salt, pass_hash: hash });
    });
    Logger.log('adminResetPassword: reset ' + user.user_id);
    return user.user_id;
  } finally {
    props.deleteProperty('RESET_USERNAME');
    props.deleteProperty('RESET_PASSWORD');
  }
}

function adminSeedFormats() {
  var latest = formatsLatestMap_();
  var created = 0;
  var skipped = 0;
  for (var i = 0; i < SEED_FORMATS.length; i++) {
    var spec = SEED_FORMATS[i];
    if (latest[spec.id]) {
      skipped++;
      continue;
    }
    withLock_(function () {
      append_('Formats', {
        format_id: spec.id,
        name: spec.name,
        version: 1,
        status: 'published',
        spec_json: JSON.stringify(spec),
        created_by: 'seed',
        created_at: nowIso_(),
        updated_at: nowIso_()
      });
    });
    created++;
  }
  Logger.log('adminSeedFormats: created ' + created + ', skipped ' + skipped);
  return { created: created, skipped: skipped };
}

function adminImportFolder() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('IMPORT_FOLDER_ID');
  var formatId = props.getProperty('IMPORT_FORMAT_ID');
  var ownerUsername = props.getProperty('IMPORT_OWNER_USERNAME');
  if (!folderId || !formatId || !ownerUsername) {
    throw new Error('IMPORT_FOLDER_ID, IMPORT_FORMAT_ID, IMPORT_OWNER_USERNAME must be set');
  }
  var owner = findBy_('Users', 'username', String(ownerUsername).trim().toLowerCase());
  if (!owner) {
    throw new Error('No such user: ' + ownerUsername);
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
      result = importDocById_(file.getId(), formatId, owner.user_id, owner.user_id);
    });
    if (result.duplicate) skipped++;
    else imported++;
  }

  var report = { imported: imported, skipped: skipped, remaining: remaining };
  Logger.log('adminImportFolder: ' + JSON.stringify(report));
  return report;
}
