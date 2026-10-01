/**
 * Users.gs — users.list, users.updateProfile.
 */

function usersList_(body, user) {
  var rows = readAll_('Users');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (!isActive_(rows[i].active)) continue;
    out.push({
      user_id: rows[i].user_id,
      display_name: rows[i].display_name,
      role: rows[i].role
    });
  }
  return out;
}

function usersUpdateProfile_(body, user) {
  var patch = {};

  if (body.playfulness_default !== undefined) {
    var pf = Number(body.playfulness_default);
    if (!Number.isInteger(pf) || pf < 1 || pf > 5) {
      throw new ApiError('BAD_INPUT', 'playfulness_default must be an integer 1..5');
    }
    patch.playfulness_default = pf;
  }

  if (body.catchphrases !== undefined) {
    var cp = String(body.catchphrases);
    if (cp.length > 2000) throw new ApiError('BAD_INPUT', 'catchphrases too long');
    patch.catchphrases = cp;
  }

  if (body.avoid_list !== undefined) {
    var av = String(body.avoid_list);
    if (av.length > 2000) throw new ApiError('BAD_INPUT', 'avoid_list too long');
    patch.avoid_list = av;
  }

  withLock_(function () {
    updateRow_('Users', user._row, patch);
  });

  var updated = findBy_('Users', 'user_id', user.user_id);
  return publicUser_(updated);
}
