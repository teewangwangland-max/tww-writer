/**
 * Comps.gs — comps.list/add.
 */

function compsList_(body, user) {
  var rows = readAll_('Comps');
  var q = body.q ? String(body.q).toLowerCase() : '';
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (q) {
      var pn = String(r.project_name || '').toLowerCase();
      var loc = String(r.location || '').toLowerCase();
      if (pn.indexOf(q) === -1 && loc.indexOf(q) === -1) continue;
    }
    out.push(stripRow_(r));
  }
  out.sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return out;
}

function parsePrice_(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').replace(/,/g, '').trim();
  var n = Number(s);
  return n;
}

function compsAdd_(body, user) {
  if (!body.project_name) throw new ApiError('BAD_INPUT', 'project_name required');
  var price = parsePrice_(body.price_per_sqm);
  if (!(price > 0) || !isFinite(price)) throw new ApiError('BAD_INPUT', 'price_per_sqm invalid');

  var row;
  withLock_(function () {
    row = {
      comp_id: newId_('comp'),
      project_name: body.project_name,
      location: body.location || '',
      price_per_sqm: price,
      source: body.source || '',
      note: body.note || '',
      created_by: user.user_id,
      created_at: nowIso_()
    };
    append_('Comps', row);
  });
  return stripRow_(row);
}
